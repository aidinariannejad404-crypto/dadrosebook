"""Discount codes: normalisation, validation and the discount amount.

``lines`` are dicts with ``book_id``, ``variant_type`` and ``line_total`` (toman) — the quote's
lines. The discount applies to items only (never to shipping) and never exceeds their total.
"""

from django.utils import timezone

from apps.core.money import format_toman, to_persian_digits
from apps.core.normalize import normalize_persian

from ..models import DiscountCode, DiscountRedemption

INVALID = "کد تخفیف معتبر نیست."
NOT_STARTED = "این کد هنوز فعال نشده است."
EXPIRED = "این کد منقضی شده است."
USED_UP = "ظرفیت استفاده از این کد تمام شده است."
USER_LIMIT = "شما پیش‌تر از این کد استفاده کرده‌اید."
NOT_ELIGIBLE = "این کد برای کالاهای سبد شما قابل استفاده نیست."


class DiscountError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def normalize_code(code: str | None) -> str:
    return normalize_persian(code or "").replace(" ", "").upper()


def label_for(code: DiscountCode) -> str:
    if code.kind == DiscountCode.Kind.PERCENT:
        return f"{to_persian_digits(code.value)}٪ تخفیف"
    return f"{format_toman(code.value)} تخفیف"


def eligible_total(code: DiscountCode, lines) -> int:
    lines = list(lines)
    formats = set(code.formats or [])
    if formats:
        lines = [line for line in lines if line["variant_type"] in formats]
    subject_ids = set(code.subjects.values_list("id", flat=True))
    if subject_ids and lines:
        from apps.catalog.models import Book

        book_ids = set(
            Book.objects.filter(
                pk__in={line["book_id"] for line in lines}, subjects__in=subject_ids
            ).values_list("id", flat=True)
        )
        lines = [line for line in lines if line["book_id"] in book_ids]
    return sum(line["line_total"] for line in lines)


def amount_for(code: DiscountCode, eligible: int) -> int:
    if code.kind == DiscountCode.Kind.PERCENT:
        amount = eligible * min(code.value, 100) // 100
        if code.max_discount is not None:
            amount = min(amount, code.max_discount)
    else:
        amount = code.value
    return max(0, min(amount, eligible))


def validate(code: str, lines, user=None, now=None) -> tuple[DiscountCode, int]:
    """Return ``(DiscountCode, amount)`` or raise ``DiscountError`` with a Persian message."""
    now = now or timezone.now()
    normalized = normalize_code(code)
    if not normalized:
        raise DiscountError(INVALID)
    obj = DiscountCode.objects.filter(code=normalized, is_active=True).first()
    if obj is None:
        raise DiscountError(INVALID)
    if obj.valid_from and now < obj.valid_from:
        raise DiscountError(NOT_STARTED)
    if obj.valid_until and now > obj.valid_until:
        raise DiscountError(EXPIRED)
    if obj.max_uses is not None and obj.redemptions.count() >= obj.max_uses:
        raise DiscountError(USED_UP)
    if (
        user is not None
        and getattr(user, "is_authenticated", False)
        and obj.per_user_limit is not None
        and DiscountRedemption.objects.filter(code=obj, user=user).count() >= obj.per_user_limit
    ):
        raise DiscountError(USER_LIMIT)
    eligible = eligible_total(obj, lines)
    if eligible <= 0:
        raise DiscountError(NOT_ELIGIBLE)
    if obj.min_order_total and eligible < obj.min_order_total:
        raise DiscountError(f"این کد برای سفارش‌های بالای {format_toman(obj.min_order_total)} است.")
    return obj, amount_for(obj, eligible)
