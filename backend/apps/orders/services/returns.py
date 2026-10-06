"""Returns and refunds (مرجوعی و استرداد وجه), run by staff from the admin.

``REQUESTED → APPROVED → RECEIVED → REFUNDED``; ``REQUESTED | APPROVED → REJECTED | CANCELLED``.
A return with no print/bundle line has nothing to receive and may go ``APPROVED → REFUNDED``.
Every change writes a ``ReturnRequestLog`` row.

* Quantities: a line may return at most the purchased quantity minus what other open or finished
  returns (not REJECTED/CANCELLED) already took.
* Money is integer toman. The default refund is the returned lines' share of their ``line_total``;
  a refund never exceeds ``order.total - order.refunded_total``.
* ``refund`` locks the return row and checks its status, so a double click never pays twice.
* Iranian law gives a 7-day withdrawal right from delivery (``within_window``); it is shown in the
  admin, never enforced.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from apps.core.money import format_toman, to_persian_digits
from apps.core.normalize import normalize_persian

from ..models import Order, OrderItem, ReturnLine, ReturnRequest, ReturnRequestLog

R = ReturnRequest.Status
M = ReturnRequest.RefundMethod

RETURN_WINDOW_DAYS = 7
OPEN_OR_DONE = (R.REQUESTED, R.APPROVED, R.RECEIVED, R.REFUNDED)

ALLOWED: dict[str, set[str]] = {
    R.REQUESTED: {R.APPROVED, R.REJECTED, R.CANCELLED},
    R.APPROVED: {R.RECEIVED, R.REFUNDED, R.REJECTED, R.CANCELLED},
    R.RECEIVED: {R.REFUNDED},
    R.REFUNDED: set(),
    R.REJECTED: set(),
    R.CANCELLED: set(),
}
# Fields staff may still edit once the case is closed.
EDITABLE_WHEN_CLOSED = ("staff_note",)


class ReturnError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# --- validators ----------------------------------------------------------------------------------


def _digits_only(value: str | None) -> str:
    text = normalize_persian(value or "", zwnj="remove") if value else ""
    return "".join(ch for ch in text.upper() if ch.isalnum())


def normalize_shaba(value: str | None) -> str:
    """``"IR06 0170 ..."`` / Persian digits / bare 24 digits → ``IR`` + 24 ASCII digits."""
    text = _digits_only(value)
    if text.isdigit() and len(text) == 24:
        text = "IR" + text
    return text


def validate_shaba(value: str | None) -> str:
    """Return the normalised IBAN or raise ``ValidationError`` (IR + 24 digits, mod-97 = 1)."""
    iban = normalize_shaba(value)
    if len(iban) != 26 or not iban.startswith("IR") or not iban[2:].isdigit():
        raise ValidationError("شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.")
    rearranged = iban[4:] + iban[:4]
    numeric = "".join(str(int(ch, 36)) for ch in rearranged)
    if int(numeric) % 97 != 1:
        raise ValidationError("شماره شبا معتبر نیست؛ رقم‌ها را دوباره بررسی کنید.")
    return iban


def validate_card_number(value: str | None) -> str:
    """Return the 16-digit card number or raise ``ValidationError`` (Luhn check)."""
    number = _digits_only(value)
    if len(number) != 16 or not number.isdigit():
        raise ValidationError("شماره کارت باید ۱۶ رقم باشد.")
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    if total % 10:
        raise ValidationError("شماره کارت معتبر نیست.")
    return number


def _check(validator, value) -> str:
    try:
        return validator(value)
    except ValidationError as exc:
        raise ReturnError(exc.messages[0]) from None


# --- the legal window ----------------------------------------------------------------------------


def window_start(order: Order):
    """Delivery time; for ebook-only orders the payment time. ``None`` = not delivered yet."""
    if not order.needs_shipping:
        return order.paid_at or order.delivered_at
    return order.delivered_at


def window_deadline(order: Order):
    start = window_start(order)
    return start + dt.timedelta(days=RETURN_WINDOW_DAYS) if start else None


def within_window(order: Order, at=None) -> bool | None:
    """``True`` inside the 7-day withdrawal window, ``False`` after it, ``None`` before delivery."""
    deadline = window_deadline(order)
    if deadline is None:
        return None
    return (at or timezone.now()) <= deadline


# --- amounts and quantities ----------------------------------------------------------------------


def returned_quantity(item: OrderItem, *, exclude=None) -> int:
    qs = ReturnLine.objects.filter(order_item=item, return_request__status__in=OPEN_OR_DONE)
    if exclude is not None and getattr(exclude, "pk", None):
        qs = qs.exclude(return_request=exclude)
    return qs.aggregate(n=Sum("quantity"))["n"] or 0


def returnable_quantity(item: OrderItem, *, exclude=None) -> int:
    return max(item.quantity - returned_quantity(item, exclude=exclude), 0)


def refundable_amount(order: Order) -> int:
    return max(order.total - order.refunded_total, 0)


def lines_share(lines: Iterable[tuple[OrderItem, int]]) -> int:
    return sum(item.line_total * qty // item.quantity for item, qty in lines if item.quantity)


def default_refund_amount(rr: ReturnRequest) -> int:
    share = lines_share((line.order_item, line.quantity) for line in rr.lines.all())
    return min(share, refundable_amount(rr.order))


def effective_refund_amount(rr: ReturnRequest) -> int:
    return rr.refund_amount if rr.refund_amount is not None else default_refund_amount(rr)


def validate_lines(
    order: Order, lines: Iterable[tuple[OrderItem | int, int]], *, exclude=None
) -> list[tuple[OrderItem, int]]:
    """Merge and check ``(order_item, quantity)`` pairs; raises ``ReturnError``."""
    items = {item.pk: item for item in order.items.all()}
    merged: dict[int, int] = {}
    for item, qty in lines:
        item_id = item if isinstance(item, int) else item.pk
        if item_id not in items:
            raise ReturnError("قلم انتخاب‌شده متعلق به این سفارش نیست.")
        if qty is None or int(qty) < 1:
            raise ReturnError("تعداد مرجوعی باید دست‌کم ۱ باشد.")
        merged[item_id] = merged.get(item_id, 0) + int(qty)
    if not merged:
        raise ReturnError("دست‌کم یک قلم برای مرجوعی انتخاب کنید.")
    result = []
    for item_id, qty in merged.items():
        item = items[item_id]
        allowed = returnable_quantity(item, exclude=exclude)
        if qty > allowed:
            raise ReturnError(
                f"«{item.title}»: حداکثر {to_persian_digits(allowed)} عدد قابل مرجوعی است "
                f"(خریداری‌شده {to_persian_digits(item.quantity)})."
            )
        result.append((item, qty))
    return result


def validate_refund_amount(order: Order, amount: int | None) -> None:
    if amount is None:
        return
    limit = refundable_amount(order)
    if amount > limit:
        raise ReturnError(
            f"مبلغ استرداد از مبلغ قابل استرداد این سفارش ({format_toman(limit)}) بیشتر است."
        )


# --- log and locking -----------------------------------------------------------------------------


def _actor(actor):
    return actor if actor is not None and getattr(actor, "pk", None) else None


def log(rr: ReturnRequest, from_status: str, to_status: str, *, actor=None, note: str = ""):
    return ReturnRequestLog.objects.create(
        return_request=rr,
        from_status=from_status,
        to_status=to_status,
        actor=_actor(actor),
        note=(note or "")[:500],
    )


def log_edit(rr: ReturnRequest, changed: Iterable[str], *, actor=None) -> None:
    labels = []
    for name in changed:
        try:
            labels.append(str(ReturnRequest._meta.get_field(name).verbose_name))
        except Exception:  # noqa: BLE001 - inline/form-only fields
            labels.append(name)
    if labels:
        log(rr, rr.status, rr.status, actor=actor, note="ویرایش: " + "، ".join(labels))


def _sync(target: ReturnRequest, source: ReturnRequest) -> None:
    if target is source:
        return
    for f in source._meta.concrete_fields:
        setattr(target, f.attname, getattr(source, f.attname))


def _lock(rr: ReturnRequest) -> ReturnRequest:
    return ReturnRequest.objects.select_for_update().select_related("order").get(pk=rr.pk)


def _ensure(locked: ReturnRequest, to_status: str) -> None:
    if to_status not in ALLOWED.get(locked.status, set()):
        raise ReturnError(
            f"تغییر وضعیت مرجوعی از «{locked.get_status_display()}» به «{R(to_status).label}» "
            "مجاز نیست."
        )


# --- services ------------------------------------------------------------------------------------


def create_return(
    order: Order,
    lines: Iterable[tuple[OrderItem | int, int]],
    *,
    reason: str,
    description: str = "",
    restock: bool = True,
    revoke_ebook: bool = False,
    refund_method: str = M.SHABA,
    refund_amount: int | None = None,
    shaba: str = "",
    card_number: str = "",
    account_holder: str = "",
    staff_note: str = "",
    actor=None,
) -> ReturnRequest:
    if reason not in ReturnRequest.Reason.values:
        raise ReturnError("دلیل مرجوعی معتبر نیست.")
    if refund_method not in M.values:
        raise ReturnError("روش استرداد معتبر نیست.")
    shaba = _check(validate_shaba, shaba) if shaba else ""
    card_number = _check(validate_card_number, card_number) if card_number else ""
    with transaction.atomic():
        locked_order = Order.objects.select_for_update().get(pk=order.pk)
        if locked_order.paid_at is None:
            raise ReturnError("برای سفارش پرداخت‌نشده نمی‌توان مرجوعی ثبت کرد.")
        checked = validate_lines(locked_order, lines)
        validate_refund_amount(locked_order, refund_amount)
        physical = any(item.needs_shipping for item, _ in checked)
        rr = ReturnRequest.objects.create(
            order=locked_order,
            reason=reason,
            description=description,
            restock=restock and physical,
            revoke_ebook=revoke_ebook,
            refund_method=refund_method,
            refund_amount=refund_amount,
            shaba=shaba,
            card_number=card_number,
            account_holder=account_holder,
            staff_note=staff_note,
            created_by=_actor(actor),
        )
        ReturnLine.objects.bulk_create(
            [ReturnLine(return_request=rr, order_item=item, quantity=qty) for item, qty in checked]
        )
        finalize_created(rr, actor=actor)
    return rr


def finalize_created(rr: ReturnRequest, *, actor=None) -> ReturnRequest:
    """After the return and its lines are saved (service or admin): default amount + first log."""
    update = []
    if rr.refund_amount is None:
        rr.refund_amount = default_refund_amount(rr)
        update.append("refund_amount")
    if rr.restock and not rr.has_physical_lines:
        rr.restock = False
        update.append("restock")
    if update:
        rr.save(update_fields=[*update, "updated_at"])
    log(rr, "", rr.status, actor=actor, note=f"ثبت مرجوعی — {rr.get_reason_display()}")
    return rr


def _move(rr: ReturnRequest, to_status: str, *, actor=None, note: str = "", stamp: str = ""):
    with transaction.atomic():
        locked = _lock(rr)
        _ensure(locked, to_status)
        from_status = locked.status
        locked.status = to_status
        fields = ["status", "updated_at"]
        if stamp:
            setattr(locked, stamp, timezone.now())
            fields.append(stamp)
        locked.save(update_fields=fields)
        log(locked, from_status, to_status, actor=actor, note=note)
    _sync(rr, locked)
    return rr


def approve(rr: ReturnRequest, *, actor=None, note: str = "") -> ReturnRequest:
    return _move(rr, R.APPROVED, actor=actor, note=note, stamp="approved_at")


def reject(rr: ReturnRequest, *, actor=None, note: str = "") -> ReturnRequest:
    return _move(rr, R.REJECTED, actor=actor, note=note, stamp="closed_at")


def cancel(rr: ReturnRequest, *, actor=None, note: str = "") -> ReturnRequest:
    return _move(rr, R.CANCELLED, actor=actor, note=note, stamp="closed_at")


def mark_received(rr: ReturnRequest, *, actor=None, note: str = "") -> ReturnRequest:
    """``APPROVED → RECEIVED``; with ``restock`` print/bundle units go back to stock."""
    from apps.catalog.models import BookVariant

    with transaction.atomic():
        locked = _lock(rr)
        _ensure(locked, R.RECEIVED)
        notes = [note] if note else []
        if locked.restock:
            per_variant: dict[int, int] = {}
            for line in locked.lines.select_related("order_item"):
                item = line.order_item
                if item.needs_shipping and item.variant_id:
                    per_variant[item.variant_id] = (
                        per_variant.get(item.variant_id, 0) + line.quantity
                    )
            variants = list(
                BookVariant.objects.select_for_update().filter(pk__in=per_variant).order_by("pk")
            )
            for variant in variants:
                BookVariant.objects.filter(pk=variant.pk).update(
                    stock=F("stock") + per_variant[variant.pk], updated_at=timezone.now()
                )
            if variants:
                total = sum(per_variant[v.pk] for v in variants)
                notes.append(f"{to_persian_digits(total)} نسخه به موجودی برگشت.")
        locked.status = R.RECEIVED
        locked.received_at = timezone.now()
        locked.save(update_fields=["status", "received_at", "updated_at"])
        log(locked, R.APPROVED, R.RECEIVED, actor=actor, note=" ".join(notes))
    _sync(rr, locked)
    return rr


def _revoke_ebooks(rr: ReturnRequest, order: Order) -> int:
    """Revoke a book's ebook only when every unit of its digital line has now been refunded."""
    from apps.library.services.entitlements import revoke_book

    revoked = 0
    for line in rr.lines.select_related("order_item"):
        item = line.order_item
        if not item.grants_ebook or not item.book_id:
            continue
        refunded = (
            ReturnLine.objects.filter(order_item=item, return_request__status=R.REFUNDED).aggregate(
                n=Sum("quantity")
            )["n"]
            or 0
        )
        if refunded >= item.quantity:
            revoked += revoke_book(order.user, item.book_id, order=order)
    return revoked


def _notify_refund(order: Order, amount: int, reference: str) -> None:
    """Tell the customer by SMS once the refund is committed (text in «قالب پیامک‌ها»)."""
    from apps.core.services.sms_templates import render_sms
    from apps.core.sms_catalog import REFUND_DONE

    from .state import _send_sms

    phone = order.user.phone
    text = render_sms(
        REFUND_DONE, order=order.number, amount=format_toman(amount), reference=reference or "—"
    )
    link = f"/account/orders/{order.number}"
    transaction.on_commit(lambda: _send_sms(phone, text, kind=REFUND_DONE, link=link))


def refund(rr: ReturnRequest, *, actor=None, note: str = "") -> ReturnRequest:
    """Pay the money back and close the case (``REFUNDED``).

    Manual methods (SHABA/CARD) need ``refund_reference`` filled first; GATEWAY calls the payment
    gateway. Raises ``ReturnError``; a second call on a refunded return raises and pays nothing.
    """
    from apps.payments.services.gateway import GatewayError
    from apps.payments.services.payments import paid_payment, refund_payment

    failure: str | None = None
    with transaction.atomic():
        locked = _lock(rr)
        if locked.status == R.REFUNDED:
            raise ReturnError("وجه این مرجوعی قبلاً مسترد شده است.")
        _ensure(locked, R.REFUNDED)
        if locked.status == R.APPROVED and locked.has_physical_lines:
            raise ReturnError("پیش از استرداد وجه، «کالا دریافت شد» را ثبت کنید.")
        order = Order.objects.select_for_update().get(pk=locked.order_id)
        amount = effective_refund_amount(locked)
        if amount <= 0:
            raise ReturnError("مبلغ استرداد صفر است.")
        validate_refund_amount(order, amount)

        method = locked.refund_method
        if method == M.GATEWAY:
            payment = paid_payment(order)
            if payment is None:
                raise ReturnError("پرداخت موفقی برای این سفارش پیدا نشد؛ استرداد دستی انجام دهید.")
            try:
                result = refund_payment(payment, amount, note=f"مرجوعی {locked.pk}")
            except GatewayError as exc:
                failure = exc.message
            else:
                locked.refund_reference = (result.ref_id or locked.refund_reference)[:64]
        else:
            if not locked.refund_reference.strip():
                raise ReturnError(
                    "پیش از «استرداد وجه» شماره پیگیری واریز را در فرم مرجوعی وارد و ذخیره کنید."
                )
            if method == M.SHABA:
                locked.shaba = _check(validate_shaba, locked.shaba)
            elif method == M.CARD:
                locked.card_number = _check(validate_card_number, locked.card_number)

        if failure is not None:
            # Keep the attempt (and the PaymentLog rows) but leave the return as it was.
            log(
                locked, locked.status, locked.status, actor=actor, note=f"استرداد ناموفق: {failure}"
            )
        else:
            from_status = locked.status
            now = timezone.now()
            locked.status = R.REFUNDED
            locked.refunded_at = now
            locked.refund_amount = amount
            locked.save(
                update_fields=[
                    "status",
                    "refunded_at",
                    "refund_amount",
                    "refund_reference",
                    "shaba",
                    "card_number",
                    "updated_at",
                ]
            )
            Order.objects.filter(pk=order.pk).update(
                refunded_total=F("refunded_total") + amount, updated_at=now
            )
            notes = [f"{format_toman(amount)} — {locked.get_refund_method_display()}"]
            if locked.refund_reference:
                notes.append(f"پیگیری: {locked.refund_reference}")
            if locked.revoke_ebook and _revoke_ebooks(locked, order):
                notes.append("دسترسی کتاب الکترونیک برداشته شد.")
            if note:
                notes.append(note)
            log(locked, from_status, R.REFUNDED, actor=actor, note=" — ".join(notes))
            _notify_refund(order, amount, locked.refund_reference)
    _sync(rr, locked)
    if failure is not None:
        raise ReturnError(failure)
    return rr
