import uuid
from unittest import mock

import pytest
from django.test import Client

from apps.accounts.models import User
from apps.orders.services import checkout, state
from apps.orders.tests.conftest import (  # noqa: F401  (fixtures)
    address,
    books,
    methods,
    no_free_shipping,
    other_user,
    user,
)


@pytest.fixture
def buy(address, methods):  # noqa: F811
    """``buy(user, *variants)`` → a paid order."""

    def _buy(customer, *variants, ship=True):
        payload = {"items": [{"variant_id": v.pk} for v in variants]}
        if ship:
            addr = address
            if customer != address.user:
                addr = address.__class__.objects.create(
                    user=customer,
                    recipient_name="مریم",
                    recipient_phone=customer.phone,
                    province="تهران",
                    city="تهران",
                    postal_code="1234567890",
                    address_line="خیابان انقلاب",
                )
            payload |= {"address_id": addr.pk, "shipping_method_id": methods["post"].pk}
        order = checkout.create_order(customer, payload, uuid.uuid4())
        with mock.patch("apps.accounts.tasks.send_sms.delay"):
            state.mark_paid(order)
        order.refresh_from_db()
        return order

    return _buy


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass12345")
    client = Client()
    client.force_login(admin)
    return client
