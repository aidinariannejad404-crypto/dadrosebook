"""Abandoned-cart reminders: one SMS to a signed-in customer whose cart sat untouched.

A cart is *abandoned* when it belongs to a user, has at least one line that can be bought now,
was last changed between ``abandoned_cart_hours`` and ``LOOKBACK_DAYS`` ago, the user has not
paid an order since that change, and it was not reminded since that change (and not in the last
``REMIND_GAP_DAYS``). Staff switch it on in «تنظیمات فروشگاه».
"""

import datetime as dt
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from apps.core.services.sms_templates import render_sms
from apps.core.services.store_settings import get_store_settings
from apps.core.sms_catalog import ABANDONED_CART
from apps.orders.models import Order

from ..models import Cart
from .rules import line_issue

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 7
REMIND_GAP_DAYS = 7
RECOVERY_DAYS = 7


def abandoned_carts(*, hours: int | None = None, now=None):
    now = now or timezone.now()
    hours = get_store_settings().abandoned_cart_hours if hours is None else hours
    paid_since = Order.objects.filter(
        user=OuterRef("user"), paid_at__gte=OuterRef("updated_at")
    ).exclude(status=Order.Status.CANCELLED)
    return (
        Cart.objects.filter(
            user__isnull=False,
            user__is_active=True,
            items__isnull=False,
            updated_at__lte=now - dt.timedelta(hours=hours),
            updated_at__gte=now - dt.timedelta(days=LOOKBACK_DAYS),
        )
        .filter(
            Q(reminded_at__isnull=True)
            | Q(reminded_at__lte=now - dt.timedelta(days=REMIND_GAP_DAYS))
        )
        .exclude(Exists(paid_since))
        .distinct()
    )


def buyable_lines(cart: Cart) -> list:
    items = cart.items.select_related("variant__book").order_by("created_at", "id")
    return [i for i in items if line_issue(i.variant, i.quantity) is None]


def reminder_text(cart: Cart, lines) -> str | None:
    store = get_store_settings()
    return render_sms(
        ABANDONED_CART,
        book=lines[0].variant.book.title,
        count=len(lines),
        link=f"{settings.SITE_URL.rstrip('/')}/cart",
        code=store.abandoned_cart_code,
    )


def send_reminders(*, force: bool = False, carts=None, now=None) -> int:
    """SMS every abandoned cart (or ``carts``); returns the number sent.

    Does nothing unless the store enabled reminders, except with ``force`` (the admin action).
    """
    from apps.accounts.tasks import send_sms

    if not force and not get_store_settings().abandoned_cart_enabled:
        return 0
    now = now or timezone.now()
    queryset = carts if carts is not None else abandoned_carts(now=now)
    sent = 0
    for cart_id in list(queryset.values_list("id", flat=True)):
        with transaction.atomic():
            cart = (
                Cart.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("user")
                .filter(pk=cart_id, user__isnull=False)
                .first()
            )
            if cart is None or (cart.reminded_at and cart.reminded_at >= cart.updated_at):
                continue
            lines = buyable_lines(cart)
            if not lines:
                continue
            text = reminder_text(cart, lines)
            if text is None:  # staff turned the template off
                return sent
            # update() keeps updated_at (the customer's last activity) unchanged.
            Cart.objects.filter(pk=cart.pk).update(reminded_at=now)
            phone = cart.user.phone
            code = get_store_settings().abandoned_cart_code or ""
            transaction.on_commit(
                lambda p=phone, t=text, c=code: send_sms.delay(
                    p, t, kind=ABANDONED_CART, link="/cart", code=c
                )
            )
            sent += 1
    return sent


def recovery(start, end) -> dict:
    """Reminders sent in ``[start, end)`` and how many were followed by a paid order."""
    reminded = Cart.objects.filter(reminded_at__gte=start, reminded_at__lt=end, user__isnull=False)
    paid_after = Order.objects.filter(
        user=OuterRef("user"),
        paid_at__gte=OuterRef("reminded_at"),
        paid_at__lt=OuterRef("reminded_at") + dt.timedelta(days=RECOVERY_DAYS),
    ).exclude(status=Order.Status.CANCELLED)
    total = reminded.count()
    recovered = reminded.filter(Exists(paid_after)).count()
    return {"reminded": total, "recovered": recovered}
