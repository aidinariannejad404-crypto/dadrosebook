"""Read-only cart computation: every Cart/CartItem field of the contract except rendering."""

from django.db.models import Prefetch

from apps.catalog.models import BookVariant, Person, Subject
from apps.catalog.services.pricing import bundle_saving
from apps.core.services.store_settings import get_store_settings

from ..models import Cart, CartItem
from .rules import line_issue, max_quantity


def cart_items_queryset(cart: Cart):
    return (
        CartItem.objects.filter(cart=cart)
        .select_related("variant__book")
        .prefetch_related(
            Prefetch("variant__book__subjects", queryset=Subject.objects.order_by("order", "id")),
            Prefetch("variant__book__authors", queryset=Person.objects.order_by("name", "id")),
            Prefetch(
                "variant__book__variants",
                queryset=BookVariant.objects.filter(is_active=True).order_by("id"),
                to_attr="cart_sibling_variants",
            ),
        )
        .order_by("created_at", "id")
    )


def line_summary(item: CartItem) -> dict:
    """Computed fields of one line. ``unit_price`` is the live effective price (no snapshot)."""
    variant = item.variant
    if variant.type == BookVariant.Type.BUNDLE:
        siblings = getattr(variant.book, "cart_sibling_variants", None)
        if siblings is None:
            siblings = list(variant.book.variants.filter(is_active=True))
        variant.bundle_saving = bundle_saving(siblings)
    unit_price = variant.effective_price
    issue = line_issue(variant, item.quantity)
    return {
        "id": item.pk,
        "item": item,
        "variant": variant,
        "book": variant.book,
        "quantity": item.quantity,
        "max_quantity": max_quantity(variant),
        "unit_price": unit_price,
        "line_total": unit_price * item.quantity,
        "line_saving": (variant.price - unit_price) * item.quantity,
        "is_available": issue is None,
        "issue": issue,
    }


def cart_summary(cart: Cart | None) -> dict:
    """All ``Cart`` fields; ``cart=None`` gives the empty cart with ``token: None``."""
    lines = [line_summary(item) for item in cart_items_queryset(cart)] if cart else []
    available = [line for line in lines if line["is_available"]]
    subtotal = sum(line["line_total"] for line in available)
    original_subtotal = sum(line["variant"].price * line["quantity"] for line in available)
    has_physical = any(line["variant"].type != BookVariant.Type.EBOOK for line in available)
    threshold = get_store_settings().free_shipping_threshold or None
    remaining = None
    if threshold and has_physical and threshold - subtotal > 0:
        remaining = threshold - subtotal
    return {
        "token": str(cart.token) if cart else None,
        "items": lines,
        "item_count": sum(line["quantity"] for line in lines),
        "subtotal": subtotal,
        "original_subtotal": original_subtotal,
        "savings": original_subtotal - subtotal,
        "has_physical": has_physical,
        "has_issues": any(not line["is_available"] for line in lines),
        "free_shipping_threshold": threshold,
        "free_shipping_remaining": remaining,
        "updated_at": cart.updated_at if cart else None,
    }
