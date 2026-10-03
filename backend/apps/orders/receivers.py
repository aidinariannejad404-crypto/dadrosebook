"""Cross-app hooks on ``order_paid``: out-of-stock recovery (Phase 2 back-in-stock requests)."""

from .signals import order_paid


def mark_back_in_stock_converted(sender, order, **kwargs) -> None:
    from apps.engagement.services.back_in_stock import mark_converted

    for variant_id in {item.variant_id for item in order.items.all() if item.variant_id}:
        mark_converted(variant_id, phone=order.user.phone, user=order.user)


def connect() -> None:
    order_paid.connect(mark_back_in_stock_converted, dispatch_uid="orders_back_in_stock_converted")
