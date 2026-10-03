"""Cart hooks for Phase 3: merge the guest cart on login, clear bought lines once paid."""

import logging

from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver

from .models import CartItem
from .services import get_cart_by_token, merge_guest_cart

logger = logging.getLogger(__name__)

CART_TOKEN_HEADER = "HTTP_X_CART_TOKEN"  # noqa: S105
CART_TOKEN_COOKIE = "dadrose_cart_token"  # noqa: S105


def guest_token_from_request(request) -> str | None:
    """Guest cart token: ``X-Cart-Token`` header, else the ``dadrose_cart_token`` cookie."""
    if request is None:
        return None
    return request.META.get(CART_TOKEN_HEADER) or request.COOKIES.get(CART_TOKEN_COOKIE) or None


@receiver(user_logged_in, dispatch_uid="cart_merge_on_login")
def merge_cart_on_login(sender, request, user, **kwargs):
    token = guest_token_from_request(request)
    if token:
        merge_guest_cart(get_cart_by_token(token), user)


def clear_paid_lines(sender, order, **kwargs):
    """Remove the variants of a paid order from its user's cart (``orders.signals.order_paid``)."""
    user = getattr(order, "user", None)
    if user is None or not getattr(user, "pk", None):
        return
    items = getattr(order, "items", None)
    variant_ids = (
        [vid for vid in (getattr(i, "variant_id", None) for i in items.all()) if vid]
        if items is not None
        else []
    )
    qs = CartItem.objects.filter(cart__user=user)
    if variant_ids:
        qs = qs.filter(variant_id__in=variant_ids)
    qs.delete()


def connect_order_paid() -> None:
    """``apps.orders`` arrives in Phase 3; connect only when it is installed."""
    try:
        from apps.orders.signals import order_paid
    except ImportError:
        logger.debug("apps.orders not installed; cart is not cleared on payment yet")
        return
    order_paid.connect(clear_paid_lines, dispatch_uid="cart_clear_on_order_paid")
