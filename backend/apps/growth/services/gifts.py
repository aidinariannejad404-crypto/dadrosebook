"""Gift by link (research item و۴).

Flow: the buyer ticks «هدیه» at checkout → ``attach_gift`` (same transaction as the order) → on
payment ``activate_for_paid_order`` (called from ``orders.services.state.mark_paid`` instead of
granting the buyer's ebooks) opens a one-time claim link ``/gift/<token>`` valid for
``GIFT_CLAIM_DAYS`` → the recipient logs in with phone OTP and ``claim``s it: ebooks become
entitlements of the recipient (source ``GIFT``); print items need the recipient's address, which is
written onto the order so staff can ship it.

``claim`` is idempotent: the same user claiming twice gets the same result; anyone else gets
``already_claimed``. Refunds keep working: ``revoke_for_order`` revokes the recipient's ebooks.
"""

import datetime as dt

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import GIFT_ENTITLEMENT_SOURCE, Gift

PENDING, ACTIVE, CLAIMED, EXPIRED, CANCELLED = (
    "pending",
    "active",
    "claimed",
    "expired",
    "cancelled",
)

STAFF_NOTE_WAITING = "سفارش هدیه: تا ثبت نشانی توسط گیرنده ارسال نشود."
STAFF_NOTE_CLAIMED = "هدیه دریافت شد؛ نشانی گیرنده ثبت شد و سفارش آماده ارسال است."

MESSAGES = {
    "not_found": "این لینک هدیه معتبر نیست.",
    "not_ready": "این هدیه هنوز پرداخت نشده است.",
    "expired": "مهلت دریافت این هدیه تمام شده است. با پشتیبانی تماس بگیرید.",
    "already_claimed": "این هدیه قبلاً دریافت شده است.",
    "cancelled": "این هدیه لغو شده است.",
    "address_required": "نشانی ارسال کتاب چاپی را انتخاب کنید.",
    "address_not_found": "نشانی انتخاب‌شده پیدا نشد.",
}

STATUS_CODES = {
    "not_found": 404,
    "not_ready": 409,
    "expired": 410,
    "already_claimed": 409,
    "cancelled": 410,
    "address_required": 400,
    "address_not_found": 400,
}


class GiftError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code
        self.message = MESSAGES[code]
        self.status = STATUS_CODES[code]


def claim_days() -> int:
    return int(getattr(settings, "GIFT_CLAIM_DAYS", 90))


def clean_text(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def attach_gift(order, data: dict) -> Gift:
    """Create the (unpaid) gift of a new order; idempotent per order."""
    gift, _ = Gift.objects.get_or_create(
        order=order,
        defaults={
            "sender_name": clean_text(data.get("sender_name"), 80) or "یک دوست",
            "recipient_name": clean_text(data.get("recipient_name"), 80),
            "message": clean_text(data.get("message"), 300),
        },
    )
    return gift


def activate_for_paid_order(order, now=None) -> bool:
    """``mark_paid`` hook (inside its transaction). ``True`` when ``order`` is a gift.

    The buyer gets no entitlement; the gift link opens and the claim window starts now.
    """
    gift = Gift.objects.select_for_update().filter(order=order).first()
    if gift is None:
        return False
    if gift.status == Gift.Status.PENDING_PAYMENT:
        now = now or timezone.now()
        gift.status = Gift.Status.ACTIVE
        gift.activated_at = now
        gift.expires_at = now + dt.timedelta(days=claim_days())
        gift.save(update_fields=["status", "activated_at", "expires_at", "updated_at"])
        if order.needs_shipping and STAFF_NOTE_WAITING not in order.staff_note:
            order.staff_note = f"{order.staff_note}\n{STAFF_NOTE_WAITING}".strip()
            order.save(update_fields=["staff_note", "updated_at"])
    return True


def state(gift: Gift, now=None) -> str:
    now = now or timezone.now()
    if gift.status == Gift.Status.CLAIMED:
        return CLAIMED
    if gift.status == Gift.Status.CANCELLED:
        return CANCELLED
    if gift.status == Gift.Status.PENDING_PAYMENT:
        return PENDING
    if gift.expires_at and now > gift.expires_at:
        return EXPIRED
    return ACTIVE


def find(token: str) -> Gift | None:
    if not token or len(token) > 40:
        return None
    return Gift.objects.select_related("order").filter(token=token).first()


def _check_claimable(gift: Gift, user, now) -> bool:
    """``True`` when this user already claimed it (idempotent replay); raises when not claimable."""
    current = state(gift, now)
    if current == CLAIMED:
        if gift.claimed_by_id == user.pk:
            return True
        raise GiftError("already_claimed")
    if current == PENDING:
        raise GiftError("not_ready")
    if current == CANCELLED:
        raise GiftError("cancelled")
    if current == EXPIRED:
        raise GiftError("expired")
    return False


def claim(token: str, user, *, address_id: int | None = None, now=None) -> Gift:
    from apps.library.services.entitlements import grant
    from apps.orders.models import Address, Order

    now = now or timezone.now()
    with transaction.atomic():
        gift = Gift.objects.select_for_update().filter(token=token).first() if token else None
        if gift is None:
            raise GiftError("not_found")
        if _check_claimable(gift, user, now):
            return gift
        order = Order.objects.select_for_update().get(pk=gift.order_id)
        if order.status in (Order.Status.CANCELLED, Order.Status.FAILED) or not order.is_paid:
            raise GiftError("cancelled")

        address = None
        if order.needs_shipping:
            if not address_id:
                raise GiftError("address_required")
            address = Address.objects.filter(pk=address_id, user=user).first()
            if address is None:
                raise GiftError("address_not_found")

        book_ids = sorted(
            {item.book_id for item in order.items.all() if item.grants_ebook and item.book_id}
        )
        for book_id in book_ids:
            grant(user, book_id, source=GIFT_ENTITLEMENT_SOURCE, order=order)

        if address is not None:
            order.shipping_address = address.snapshot()
            note = order.staff_note.replace(STAFF_NOTE_WAITING, "").strip()
            order.staff_note = f"{note}\n{STAFF_NOTE_CLAIMED}".strip()
            order.save(update_fields=["shipping_address", "staff_note", "updated_at"])
            gift.shipping_address = order.shipping_address

        gift.status = Gift.Status.CLAIMED
        gift.claimed_by = user
        gift.claimed_at = now
        gift.save(
            update_fields=["status", "claimed_by", "claimed_at", "shipping_address", "updated_at"]
        )
    return gift


def claim_url(gift: Gift) -> str:
    return f"{settings.SITE_URL.rstrip('/')}/gift/{gift.token}"
