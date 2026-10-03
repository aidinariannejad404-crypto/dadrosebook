"""Cart identity and mutations. Every quantity change runs in a transaction with the cart locked."""

import uuid
from collections.abc import Iterable
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import BookVariant

from ..models import Cart, CartItem
from .rules import (
    ALREADY_IN_BUNDLE,
    INVALID_QUANTITY,
    NOT_FOUND,
    CartError,
    cart_max_quantity,
    ensure_addable,
    is_ebook,
    quantity_limit,
    validate_requested_quantity,
)

CART_TOKEN_HEADER = "HTTP_X_CART_TOKEN"  # noqa: S105 — a header name, not a secret


def _parse_token(token) -> uuid.UUID | None:
    if not token:
        return None
    if isinstance(token, uuid.UUID):
        return token
    try:
        return uuid.UUID(str(token).strip())
    except (ValueError, AttributeError):
        return None


def get_cart_by_token(token) -> Cart | None:
    """The cart named by ``token`` (a UUID or its string), or ``None`` when unknown/invalid."""
    parsed = _parse_token(token)
    if parsed is None:
        return None
    return Cart.objects.filter(token=parsed).first()


def _guest_cart(token) -> Cart | None:
    cart = get_cart_by_token(token)
    return cart if cart is not None and cart.user_id is None else None


def _is_authenticated(user) -> bool:
    return user is not None and bool(getattr(user, "is_authenticated", False))


def get_or_create_cart(token, user=None) -> Cart:
    """The user's cart (created when missing) or the guest cart for ``token`` (new when unknown)."""
    if _is_authenticated(user):
        cart, _ = Cart.objects.get_or_create(user=user)
        return cart
    cart = _guest_cart(token)
    if cart is None:
        cart = Cart.objects.create()
    return cart


def request_cart_token(request) -> str | None:
    return request.META.get(CART_TOKEN_HEADER) or None


def get_cart_for_request(request, *, create: bool = False) -> Cart | None:
    """Resolve the cart of a request (``X-Cart-Token`` header + optional signed-in user).

    A signed-in user gets their own cart; a guest cart named by the header is merged into it
    first. Without a usable cart, ``None`` is returned unless ``create`` (mutating calls).
    """
    token = request_cart_token(request)
    user = getattr(request, "user", None)
    if _is_authenticated(user):
        guest = _guest_cart(token)
        if guest is not None:
            return merge_guest_cart(guest, user)
        cart = Cart.objects.filter(user=user).first()
        if cart is None and create:
            cart = get_or_create_cart(None, user)
        return cart
    cart = _guest_cart(token)
    if cart is None and create:
        cart = Cart.objects.create()
    return cart


def _lock(cart: Cart) -> Cart:
    return Cart.objects.select_for_update().get(pk=cart.pk)


def _touch(cart: Cart) -> None:
    cart.save(update_fields=["updated_at"])


def _fresh_variant(variant: BookVariant | int) -> BookVariant:
    pk = variant.pk if isinstance(variant, BookVariant) else variant
    return BookVariant.objects.select_related("book").get(pk=pk)


def _apply_add(cart: Cart, variant: BookVariant, quantity: int) -> CartItem:
    """Add rules on a locked cart (shared by ``add_item`` and ``merge_guest_cart``)."""
    book_id = variant.book_id
    if variant.type == BookVariant.Type.EBOOK:
        if cart.items.filter(
            variant__book_id=book_id, variant__type=BookVariant.Type.BUNDLE
        ).exists():
            raise CartError(ALREADY_IN_BUNDLE)
    elif variant.type == BookVariant.Type.BUNDLE:
        cart.items.filter(variant__book_id=book_id, variant__type=BookVariant.Type.EBOOK).delete()

    item = cart.items.filter(variant=variant).first()
    current = item.quantity if item else 0
    new_quantity = min(current + quantity, quantity_limit(variant))
    if item is None:
        item = CartItem.objects.create(cart=cart, variant=variant, quantity=new_quantity)
    elif item.quantity != new_quantity:
        item.quantity = new_quantity
        item.save(update_fields=["quantity", "updated_at"])
    return item


def add_item(cart: Cart, variant: BookVariant | int, quantity: int = 1) -> CartItem:
    """Add ``quantity`` of a variant; an existing line is incremented and clamped (not an error).

    Raises ``CartError`` (``unavailable``/``price_unavailable``/``out_of_stock``/
    ``already_in_bundle``/``invalid_quantity``).
    """
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
        raise CartError(INVALID_QUANTITY)
    with transaction.atomic():
        locked = _lock(cart)
        variant = _fresh_variant(variant)
        ensure_addable(variant)
        item = _apply_add(locked, variant, quantity)
        _touch(locked)
    cart.updated_at = locked.updated_at
    return item


def _get_item(cart: Cart, item_id) -> CartItem:
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        raise CartError(NOT_FOUND) from None
    item = cart.items.select_related("variant__book").filter(pk=item_id).first()
    if item is None:
        raise CartError(NOT_FOUND)
    return item


def set_quantity(cart: Cart, item_id: int, quantity: int) -> CartItem | None:
    """Set a line's quantity (1..max_quantity); 0 removes the line (returns ``None``)."""
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 0:
        raise CartError(INVALID_QUANTITY)
    with transaction.atomic():
        locked = _lock(cart)
        item = _get_item(locked, item_id)
        if quantity == 0:
            item.delete()
            item = None
        else:
            validate_requested_quantity(item.variant, quantity)
            if item.quantity != quantity:
                item.quantity = quantity
                item.save(update_fields=["quantity", "updated_at"])
        _touch(locked)
    cart.updated_at = locked.updated_at
    return item


def remove_item(cart: Cart, item_id: int) -> None:
    with transaction.atomic():
        locked = _lock(cart)
        _get_item(locked, item_id).delete()
        _touch(locked)
    cart.updated_at = locked.updated_at


def bulk_add(cart: Cart, items: Iterable[dict]) -> tuple[list[int], list[dict]]:
    """Add several ``{"variant_id", "quantity"}`` entries; per-item errors never fail the batch.

    Returns ``(added_variant_ids, skipped)`` where each skipped entry is
    ``{"variant_id", "code", "detail"}``.
    """
    added: list[int] = []
    skipped: list[dict] = []
    for entry in items:
        variant_id = entry.get("variant_id")
        quantity = entry.get("quantity", 1)
        try:
            if not isinstance(variant_id, int) or isinstance(variant_id, bool):
                raise CartError(NOT_FOUND, "این نسخه پیدا نشد.")
            if not BookVariant.objects.filter(pk=variant_id).exists():
                raise CartError(NOT_FOUND, "این نسخه پیدا نشد.")
            add_item(cart, variant_id, quantity)
        except CartError as exc:
            skipped.append({"variant_id": variant_id, "code": exc.code, "detail": exc.detail})
        else:
            added.append(variant_id)
    return added, skipped


def clear_cart(cart: Cart) -> None:
    """Remove every line; the cart (and its token) is kept."""
    with transaction.atomic():
        locked = _lock(cart)
        locked.items.all().delete()
        _touch(locked)
    cart.updated_at = locked.updated_at


def merge_guest_cart(guest_cart: Cart | None, user) -> Cart:
    """Merge a guest cart into ``user``'s cart and return the user's cart.

    - The user has no cart → the guest cart becomes theirs.
    - Same variant in both → quantities are summed and clamped to the line limit.
    - The bundle/ebook rule holds: a guest EBOOK is dropped when the user has that book's BUNDLE;
      a guest BUNDLE replaces the user's EBOOK line.
    - The guest cart is deleted afterwards. A cart owned by another user is never touched.
    """
    with transaction.atomic():
        user_cart = Cart.objects.select_for_update().filter(user=user).first()
        guest = (
            Cart.objects.select_for_update().filter(pk=guest_cart.pk).first()
            if guest_cart is not None
            else None
        )
        if guest is None or guest.user_id is not None:
            if guest is not None and guest.user_id == user.pk:
                return guest
            if user_cart is None:
                user_cart = Cart.objects.create(user=user)
            return user_cart
        if user_cart is None:
            guest.user = user
            guest.save(update_fields=["user", "updated_at"])
            return guest

        for item in guest.items.select_related("variant__book").order_by("created_at", "id"):
            variant = item.variant
            existing = user_cart.items.filter(variant=variant).first()
            if existing is not None:
                limit = quantity_limit(variant) or cart_max_quantity()
                existing.quantity = max(1, min(existing.quantity + item.quantity, limit))
                existing.save(update_fields=["quantity", "updated_at"])
                continue
            same_book = user_cart.items.filter(variant__book_id=variant.book_id)
            if is_ebook(variant):
                if same_book.filter(variant__type=BookVariant.Type.BUNDLE).exists():
                    continue  # the user's bundle already includes this ebook
            elif variant.type == BookVariant.Type.BUNDLE:
                same_book.filter(variant__type=BookVariant.Type.EBOOK).delete()
            # Moved as is: a line whose stock dropped is flagged on read, never mutated here.
            item.cart = user_cart
            item.save(update_fields=["cart", "updated_at"])
        guest.delete()
        _touch(user_cart)
    return user_cart


def purge_stale_carts(days: int | None = None) -> int:
    """Delete guest carts untouched for ``days`` (default ``CART_TTL_DAYS``); returns the count."""
    if days is None:
        days = int(getattr(settings, "CART_TTL_DAYS", 60))
    cutoff = timezone.now() - timedelta(days=days)
    stale = Cart.objects.filter(user__isnull=True, updated_at__lt=cutoff)
    count = stale.count()
    stale.delete()
    return count
