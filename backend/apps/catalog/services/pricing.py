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
    """``Min`` aggregate of active variants' effective price, for annotating a Book queryset."""
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
        filter=Q(**{f"{prefix}is_active": True}),
    )


def book_min_price(variants) -> int | None:
    """Lowest effective price among (already filtered, active) variant objects."""
    prices = [v.effective_price for v in variants]
    return min(prices) if prices else None
