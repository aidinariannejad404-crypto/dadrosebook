"""Variant pricing. All amounts are integer toman."""

from django.db.models import Case, F, IntegerField, Min, Q, When


def effective_price(price: int, sale_price: int | None) -> int:
    """``sale_price`` when it is set and lower than ``price``, otherwise ``price``."""
    if sale_price is not None and sale_price < price:
        return sale_price
    return price


def discount_percent(price: int, sale_price: int | None) -> int:
    """Rounded discount percentage 0..100."""
    if not price:
        return 0
    eff = effective_price(price, sale_price)
    return max(0, min(100, round((price - eff) * 100 / price)))


def round_to(value: float, step: int = 10_000) -> int:
    """Round a toman amount to the nearest ``step`` (placeholder price generation)."""
    return int(round(value / step) * step)


def min_effective_price_expression(prefix: str = "variants__"):
    """``Min`` aggregate of active, non-placeholder variants' effective price (Book queryset).

    Placeholder prices are never sold, so they never feed price filters or ordering.
    """
    return Min(
        Case(
            When(
                Q(**{f"{prefix}sale_price__isnull": False})
                & Q(**{f"{prefix}sale_price__lt": F(f"{prefix}price")}),
                then=F(f"{prefix}sale_price"),
            ),
            default=F(f"{prefix}price"),
            output_field=IntegerField(),
        ),
        filter=Q(**{f"{prefix}is_active": True, f"{prefix}price_is_placeholder": False}),
    )


def sellable(variants) -> list:
    """Variants whose price is confirmed (``price_is_placeholder`` is false)."""
    return [v for v in variants if not getattr(v, "price_is_placeholder", False)]


def book_min_price(variants) -> int | None:
    """Lowest effective price among (already filtered, active) non-placeholder variants."""
    prices = [v.effective_price for v in sellable(variants)]
    return min(prices) if prices else None


def book_card_variant(variants):
    """Variant whose price a book card shows: the print edition when sold, else the cheapest.

    Cards lead with the print price because that is what most buyers compare; ebook and bundle
    prices are shown on the product page's format switcher. Placeholder prices are ignored, so a
    book with only placeholder prices has no card variant (the card shows «قیمت به‌زودی»).
    """
    variants = sellable(variants)
    for variant in variants:
        if variant.type == "PRINT":
            return variant
    return min(variants, key=lambda v: v.effective_price, default=None)


def bundle_saving(variants) -> int | None:
    """Toman saved by buying the BUNDLE instead of PRINT + EBOOK separately.

    ``PRINT.effective + EBOOK.effective − BUNDLE.effective`` when all three exist, none has a
    placeholder price and the result is positive; otherwise ``None``.
    """
    by_type = {v.type: v for v in variants}
    trio = [by_type.get(t) for t in ("PRINT", "EBOOK", "BUNDLE")]
    if any(v is None or v.price_is_placeholder for v in trio):
        return None
    print_, ebook, bundle = trio
    saving = print_.effective_price + ebook.effective_price - bundle.effective_price
    return saving if saving > 0 else None


def card_discount(variant) -> dict:
    """Crossed-out price for a card: ``{"compare_price": int|None, "discount_percent": int|None}``.

    ``variant`` is the card variant (``book_card_variant``). The compare-at price is the variant's
    list ``price`` and is only shown when the sale price really is lower; a discount that rounds
    to 0 % is not worth a badge, so both values are ``None`` then.
    """
    none = {"compare_price": None, "discount_percent": None}
    if variant is None or getattr(variant, "price_is_placeholder", False):
        return none
    if variant.effective_price >= variant.price:
        return none
    percent = discount_percent(variant.price, variant.sale_price)
    if percent <= 0:
        return none
    return {"compare_price": variant.price, "discount_percent": percent}


def quick_add_variant(variants):
    """Variant a card's «افزودن به سبد» adds: the card variant when it can be bought right now.

    ``None`` when there is no sellable card variant or it is out of stock — the card then keeps
    its notify-me / product-page path instead of a one-tap add.
    """
    variant = book_card_variant(variants)
    if variant is None or not variant.in_stock:
        return None
    return variant
