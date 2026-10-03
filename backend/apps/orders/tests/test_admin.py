import uuid
from unittest import mock

import pytest
from django.test import Client

from apps.accounts.models import User
from apps.orders.models import DiscountCode, Order
from apps.orders.services import checkout, state


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass12345")
    client = Client()
    client.force_login(admin)
    return client


@pytest.fixture
def paid_order(user, books, methods, address):
    order = checkout.create_order(
        user,
        {
            "items": [{"variant_id": books["civil_print"].pk}],
            "address_id": address.pk,
            "shipping_method_id": methods["post"].pk,
        },
        uuid.uuid4(),
    )
    with mock.patch("apps.accounts.tasks.send_sms.delay"):
        state.mark_paid(order)
    return order


@pytest.mark.parametrize(
    "url",
    [
        "/admin/orders/order/",
        "/admin/orders/shippingmethod/",
        "/admin/orders/discountcode/",
        "/admin/orders/discountcode/add/",
        "/admin/orders/discountredemption/",
        "/admin/orders/address/?q=0912",
    ],
)
def test_admin_pages(admin_client, paid_order, url):
    assert admin_client.get(url).status_code == 200


def test_order_change_page(admin_client, paid_order):
    assert admin_client.get(f"/admin/orders/order/{paid_order.pk}/change/").status_code == 200
    res = admin_client.get("/admin/orders/order/", {"q": paid_order.user.phone})
    assert paid_order.number in res.content.decode()


def test_status_actions(admin_client, paid_order):
    url = "/admin/orders/order/"
    post = {"_selected_action": [paid_order.pk]}
    admin_client.post(url, {**post, "action": "to_shipped"})
    paid_order.refresh_from_db()
    assert paid_order.status == Order.Status.PAID  # no tracking code yet
    admin_client.post(url, {**post, "action": "to_processing"})
    Order.objects.filter(pk=paid_order.pk).update(tracking_code="T1")
    with mock.patch("apps.accounts.tasks.send_sms.delay"):
        admin_client.post(url, {**post, "action": "to_shipped"})
    paid_order.refresh_from_db()
    assert paid_order.status == Order.Status.SHIPPED
    log = paid_order.status_logs.last()
    assert log.actor is not None


def test_discount_form_formats_checkboxes(admin_client):
    res = admin_client.post(
        "/admin/orders/discountcode/add/",
        {
            "code": "ebook 20",
            "kind": "PERCENT",
            "value": "20",
            "min_order_total": "0",
            "per_user_limit": "1",
            "formats": ["EBOOK", "BUNDLE"],
            "is_active": "on",
        },
    )
    assert res.status_code == 302, res.content.decode()[:2000]
    code = DiscountCode.objects.get()
    assert code.code == "EBOOK20" and code.formats == ["EBOOK", "BUNDLE"]
