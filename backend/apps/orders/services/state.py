"""The order state machine. Every change writes an ``OrderStatusLog`` row.

``PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED``; ``PENDING_PAYMENT → FAILED |
CANCELLED``; ebook-only orders go ``PAID → DELIVERED`` at once. ``mark_paid`` is idempotent and
safe under concurrency (row lock on the order), and also accepts a late successful payment of a
FAILED/CANCELLED order: a paid order is never lost.
"""

import datetime as dt
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.core.money import format_toman, to_persian_digits
from apps.core.services.sms_templates import render_sms
from apps.core.sms_catalog import ORDER_PAID, ORDER_SHIPPED

from ..models import DiscountRedemption, Order, OrderStatusLog

logger = logging.getLogger(__name__)

S = Order.Status

ALLOWED: dict[str, set[str]] = {
    S.PENDING_PAYMENT: {S.PAID, S.FAILED, S.CANCELLED},
    S.PAID: {S.PROCESSING, S.SHIPPED, S.DELIVERED, S.CANCELLED},
    S.PROCESSING: {S.SHIPPED, S.DELIVERED, S.CANCELLED},
    S.SHIPPED: {S.DELIVERED},
    S.DELIVERED: set(),
    S.FAILED: {S.CANCELLED},
    S.CANCELLED: set(),
}
# A late successful bank callback may still pay these (see ``mark_paid``).
PAYABLE_FROM = {S.PENDING_PAYMENT, S.FAILED, S.CANCELLED}

LATE_PAYMENT_NOTE = "پرداخت پس از لغو"
EXPIRED_NOTE = "لغو خودکار: پرداخت در مهلت انجام نشد."


class TransitionError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in ALLOWED.get(from_status, set())


def _log(order, from_status, to_status, *, actor=None, note=""):
    OrderStatusLog.objects.create(
        order=order,
        from_status=from_status,
        to_status=to_status,
        actor=actor if actor is not None and getattr(actor, "pk", None) else None,
        note=(note or "")[:300],
    )


def _sync(target: Order, source: Order) -> None:
    """Copy the locked row's fields onto the caller's instance."""
    if target is source:
        return
    for f in source._meta.concrete_fields:
        setattr(target, f.attname, getattr(source, f.attname))


def _send_sms(phone: str, message: str | None, kind: str = "", link: str = "") -> None:
    """Queue an SMS; ``None`` (template switched off in the admin) sends nothing.

    ``kind``/``link`` give the customer's inbox copy its type and deep link (PF-2).
    """
    if not message:
        return
    try:
        from apps.accounts.tasks import send_sms

        send_sms.delay(phone, message, kind=kind, link=link)
    except Exception:
        logger.exception("order SMS to %s failed", phone)


def _apply(order: Order, to_status: str, now) -> list[str]:
    order.status = to_status
    fields = ["status", "updated_at"]
    if to_status == S.SHIPPED:
        order.shipped_at = now
        fields.append("shipped_at")
    elif to_status == S.DELIVERED:
        order.delivered_at = now
        fields.append("delivered_at")
    elif to_status == S.CANCELLED:
        order.cancelled_at = now
        fields.append("cancelled_at")
    return fields


def transition(order: Order, to_status: str, *, actor=None, note: str = "") -> Order:
    """Move ``order`` to ``to_status`` (not PAID: use ``mark_paid``). Raises ``TransitionError``."""
    if to_status == S.PAID:
        raise TransitionError("برای ثبت پرداخت از mark_paid استفاده کنید.")
    with transaction.atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if not can_transition(locked.status, to_status):
            raise TransitionError(
                f"تغییر وضعیت از «{locked.get_status_display()}» به "
                f"«{S(to_status).label}» مجاز نیست."
            )
        if to_status == S.SHIPPED and not locked.tracking_code.strip():
            raise TransitionError("پیش از ثبت «ارسال‌شده» کد رهگیری مرسوله را وارد کنید.")
        from_status = locked.status
        fields = _apply(locked, to_status, timezone.now())
        locked.save(update_fields=fields)
        _log(locked, from_status, to_status, actor=actor, note=note)
        if to_status == S.SHIPPED:
            phone, number, tracking = locked.user.phone, locked.number, locked.tracking_code
            transaction.on_commit(
                lambda: _send_sms(
                    phone,
                    render_sms(ORDER_SHIPPED, order=number, tracking=tracking),
                    kind=ORDER_SHIPPED,
                    link=f"/account/orders/{number}",
                )
            )
    _sync(order, locked)
    return order


def cancel(order: Order, actor=None, note: str = "") -> Order:
    return transition(order, S.CANCELLED, actor=actor, note=note)


def mark_failed(order: Order, note: str = "") -> bool:
    """``PENDING_PAYMENT → FAILED``; no-op (``False``) in any other state."""
    with transaction.atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.status != S.PENDING_PAYMENT:
            return False
        locked.status = S.FAILED
        locked.save(update_fields=["status", "updated_at"])
        _log(locked, S.PENDING_PAYMENT, S.FAILED, note=note)
    _sync(order, locked)
    return True


def _decrement_stock(order: Order) -> list[str]:
    """Decrement PRINT/BUNDLE stock under row locks; shortfalls become notes, never errors."""
    from apps.catalog.models import BookVariant

    needed: dict[int, int] = {}
    titles: dict[int, str] = {}
    for item in order.items.all():
        if item.needs_shipping and item.variant_id:
            needed[item.variant_id] = needed.get(item.variant_id, 0) + item.quantity
            titles[item.variant_id] = item.title
    shortages = []
    variants = BookVariant.objects.select_for_update().filter(pk__in=needed).order_by("pk")
    for variant in variants:
        qty = needed[variant.pk]
        if variant.stock < qty:
            shortages.append(
                f"{titles[variant.pk]} ({variant.get_type_display()}): "
                f"{to_persian_digits(qty)} سفارش، {to_persian_digits(variant.stock)} موجود"
            )
            variant.stock = 0
        else:
            variant.stock -= qty
        variant.save(update_fields=["stock", "updated_at"])
    return shortages


def _bump_sales(order: Order) -> None:
    from apps.catalog.models import Book

    per_book: dict[int, int] = {}
    for item in order.items.all():
        if item.book_id:
            per_book[item.book_id] = per_book.get(item.book_id, 0) + item.quantity
    for book_id, qty in per_book.items():
        Book.objects.filter(pk=book_id).update(sales_count=F("sales_count") + qty)


def _redeem_discount(order: Order) -> None:
    from ..models import DiscountCode

    if not order.discount_code_id or order.discount_total <= 0:
        return
    _, created = DiscountRedemption.objects.get_or_create(
        order=order,
        defaults={
            "code_id": order.discount_code_id,
            "user_id": order.user_id,
            "amount": order.discount_total,
        },
    )
    if created:
        DiscountCode.objects.filter(pk=order.discount_code_id).update(
            used_count=F("used_count") + 1
        )


def mark_paid(order: Order, *, payment=None, note: str = "") -> bool:
    """Mark the order PAID (one transaction). Returns ``True`` only when it transitioned."""
    from apps.library.services.entitlements import grant_for_order

    with transaction.atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.paid_at is not None or locked.status not in PAYABLE_FROM:
            _sync(order, locked)
            return False
        from_status = locked.status
        notes = [note] if note else []
        if payment is not None and getattr(payment, "ref_id", ""):
            notes.append(f"کد پیگیری بانک: {payment.ref_id}")
        if from_status != S.PENDING_PAYMENT:
            notes.append(LATE_PAYMENT_NOTE)
        now = timezone.now()
        locked.status = S.PAID
        locked.paid_at = now
        update = ["status", "paid_at", "updated_at"]

        shortages = _decrement_stock(locked)
        if shortages:
            line = "کمبود موجودی: " + "؛ ".join(shortages)
            locked.staff_note = f"{locked.staff_note}\n{line}".strip()
            update.append("staff_note")
        if from_status != S.PENDING_PAYMENT:
            line = f"{LATE_PAYMENT_NOTE} (وضعیت قبلی: {S(from_status).label})"
            locked.staff_note = f"{locked.staff_note}\n{line}".strip()
            update.append("staff_note")
        locked.save(update_fields=list(dict.fromkeys(update)))
        _log(locked, from_status, S.PAID, note=" — ".join(notes))

        _redeem_discount(locked)
        # --- growth (و۴): a gift's ebooks go to the recipient when the link is claimed ---
        from apps.growth.services.gifts import activate_for_paid_order

        if not activate_for_paid_order(locked, now=now):
            grant_for_order(locked)
        # --- end growth ---
        _bump_sales(locked)

        if not locked.needs_shipping:
            fields = _apply(locked, S.DELIVERED, now)
            locked.save(update_fields=fields)
            _log(locked, S.PAID, S.DELIVERED, note="کتاب الکترونیک به کتابخانه افزوده شد.")

        phone, number, total = locked.user.phone, locked.number, format_toman(locked.total)
        transaction.on_commit(
            lambda: _send_sms(
                phone,
                render_sms(ORDER_PAID, order=number, total=total),
                kind=ORDER_PAID,
                link=f"/account/orders/{number}",
            )
        )
        transaction.on_commit(lambda: _send_order_paid(locked))
    _sync(order, locked)
    return True


def _send_order_paid(order: Order) -> None:
    from ..signals import order_paid

    for receiver, response in order_paid.send_robust(sender=Order, order=order):
        if isinstance(response, Exception):
            logger.error("order_paid receiver %r failed: %r", receiver, response)


def payment_deadline(order: Order):
    return order.created_at + dt.timedelta(minutes=settings.ORDER_PAYMENT_TIMEOUT_MINUTES)


def can_pay(order: Order, now=None) -> bool:
    now = now or timezone.now()
    return order.status == S.PENDING_PAYMENT and now < payment_deadline(order)


def expire_unpaid(now=None) -> int:
    """Cancel PENDING_PAYMENT orders older than ``ORDER_PAYMENT_TIMEOUT_MINUTES``."""
    now = now or timezone.now()
    cutoff = now - dt.timedelta(minutes=settings.ORDER_PAYMENT_TIMEOUT_MINUTES)
    count = 0
    stale = Order.objects.filter(status=S.PENDING_PAYMENT, created_at__lt=cutoff)
    for order in stale.only("pk").iterator():
        try:
            transition(order, S.CANCELLED, note=EXPIRED_NOTE)
        except TransitionError:  # paid (or changed) meanwhile
            continue
        count += 1
    return count
