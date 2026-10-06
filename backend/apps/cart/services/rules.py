"""Cart line rules: errors, availability and quantity limits (``docs/api-contract-phase-2.md``)."""

from django.conf import settings

from apps.catalog.models import BookVariant
from apps.core.money import to_persian_digits

OUT_OF_STOCK = "out_of_stock"
INSUFFICIENT_STOCK = "insufficient_stock"
PRICE_UNAVAILABLE = "price_unavailable"
UNAVAILABLE = "unavailable"
ALREADY_IN_BUNDLE = "already_in_bundle"
INVALID_QUANTITY = "invalid_quantity"
NOT_FOUND = "not_found"

MESSAGES = {
    OUT_OF_STOCK: "این نسخه در حال حاضر موجود نیست.",
    INSUFFICIENT_STOCK: "موجودی این نسخه کمتر از تعداد درخواستی است.",
    PRICE_UNAVAILABLE: "قیمت این نسخه هنوز اعلام نشده و فعلاً قابل خرید نیست.",
    UNAVAILABLE: "این نسخه دیگر برای فروش عرضه نمی‌شود.",
    ALREADY_IN_BUNDLE: "نسخه الکترونیک این کتاب در بسته «چاپی + الکترونیک» سبد شما هست.",
    INVALID_QUANTITY: "تعداد واردشده معتبر نیست.",
    NOT_FOUND: "این مورد در سبد خرید پیدا نشد.",
}


class CartError(Exception):
    """A business-rule error; the API renders it as ``{code, detail, cart}``."""

    def __init__(self, code: str, detail: str | None = None):
        self.code = code
        self.detail = detail or MESSAGES.get(code, MESSAGES[INVALID_QUANTITY])
        super().__init__(self.detail)


def cart_max_quantity() -> int:
    return int(getattr(settings, "CART_MAX_QUANTITY", 10))


def is_ebook(variant: BookVariant) -> bool:
    return variant.type == BookVariant.Type.EBOOK


def sellable_issue(variant: BookVariant) -> str | None:
    """Why the variant can't be sold at all right now (``None`` when it can)."""
    if not variant.is_active or not variant.book.is_active:
        return UNAVAILABLE
    if variant.price_is_placeholder:
        return PRICE_UNAVAILABLE
    if not is_ebook(variant) and variant.stock <= 0:
        return OUT_OF_STOCK
    return None


def quantity_limit(variant: BookVariant) -> int:
    """Most units a line may hold ignoring availability: 1 for an ebook, else stock capped."""
    if is_ebook(variant):
        return 1
    return max(0, min(variant.stock, cart_max_quantity()))


def max_quantity(variant: BookVariant) -> int:
    """``CartItem.max_quantity``: 0 when the variant can't be sold."""
    if sellable_issue(variant) is not None:
        return 0
    return quantity_limit(variant)


def line_issue(variant: BookVariant, quantity: int) -> str | None:
    """``CartItem.issue`` for a line (never mutates anything)."""
    issue = sellable_issue(variant)
    if issue is not None:
        return issue
    if quantity > max_quantity(variant):
        return INSUFFICIENT_STOCK
    return None


def ensure_addable(variant: BookVariant) -> None:
    issue = sellable_issue(variant)
    if issue is not None:
        raise CartError(issue)


def validate_requested_quantity(variant: BookVariant, quantity: int) -> None:
    """For an explicit quantity (PATCH): must be 1..max_quantity."""
    if quantity < 1:
        raise CartError(INVALID_QUANTITY)
    ensure_addable(variant)
    if is_ebook(variant) and quantity > 1:
        raise CartError(INVALID_QUANTITY, "از نسخه الکترونیک فقط یک عدد می‌توان خرید.")
    limit = cart_max_quantity()
    if quantity > limit:
        raise CartError(
            INVALID_QUANTITY, f"حداکثر {to_persian_digits(limit)} عدد از هر نسخه قابل سفارش است."
        )
    if quantity > variant.stock:
        raise CartError(
            INSUFFICIENT_STOCK, f"فقط {to_persian_digits(variant.stock)} عدد از این نسخه موجود است."
        )
