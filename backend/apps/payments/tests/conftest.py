import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.orders.models import Order


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user("09121234567")


@pytest.fixture
def make_order(user):
    def _make(total=1_700_000, **kw):
        kw.setdefault("status", Order.Status.PENDING_PAYMENT)
        return Order.objects.create(user=user, items_total=total, total=total, **kw)

    return _make


@pytest.fixture
def order(make_order):
    return make_order()


@pytest.fixture
def fake_gateway(settings):
    settings.PAYMENT_GATEWAY = "fake"
    settings.PUBLIC_API_URL = "http://api.test/api/v1"
    settings.FRONTEND_URL = "http://shop.test"
    return settings


@pytest.fixture
def state_mocks(monkeypatch):
    """Replace worker B's order state functions (unit tests of the payment flow only)."""
    # "failed" stays empty: declined/cancelled attempts keep the order payable.
    calls = {"paid": [], "failed": []}

    def fake_paid(order, payment):
        calls["paid"].append((order.pk, payment.pk))
        return True

    monkeypatch.setattr("apps.payments.services.payments._mark_paid", fake_paid)
    return calls
