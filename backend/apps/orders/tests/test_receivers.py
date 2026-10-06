import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.engagement.models import BackInStockRequest
from apps.orders.receivers import mark_back_in_stock_converted
from apps.orders.services import checkout

pytestmark = pytest.mark.django_db


def test_paid_order_converts_notified_back_in_stock_request(user, books):
    order = checkout.create_order(
        user, {"items": [{"variant_id": books["commerce_ebook"].pk}]}, uuid.uuid4()
    )
    item = order.items.first()
    req = BackInStockRequest.objects.create(
        variant_id=item.variant_id,
        phone=order.user.phone,
        status=BackInStockRequest.Status.NOTIFIED,
        notified_at=timezone.now() - timedelta(days=1),
    )
    mark_back_in_stock_converted(sender=None, order=order)
    req.refresh_from_db()
    assert req.converted_at is not None
