import uuid
from unittest import mock

from rest_framework.test import APIClient

from apps.catalog.models import BookVariant
from apps.orders.models import Order
from apps.orders.services import checkout, state
from apps.payments.services.gateway import GatewayError

START = "apps.payments.services.payments.start_payment"


def checkout_body(books, methods, address, key=None):
    return {
        "items": [
            {"variant_id": books["civil_print"].pk, "quantity": 1},
            {"variant_id": books["civil_ebook"].pk, "quantity": 1},
        ],
        "address_id": address.pk,
        "shipping_method_id": methods["post"].pk,
        "checkout_key": str(key or uuid.uuid4()),
    }


def test_checkout_requires_login(api, books, methods, address):
    res = api.post("/api/v1/checkout/", checkout_body(books, methods, address), format="json")
    assert res.status_code == 401


def test_checkout_endpoint(auth_api, books, methods, address):
    body = checkout_body(books, methods, address)
    with mock.patch(START, return_value="https://sandbox.zarinpal.com/pg/StartPay/A1"):
        res = auth_api.post("/api/v1/checkout/", body, format="json")
        again = auth_api.post("/api/v1/checkout/", body, format="json")
    assert res.status_code == 201, res.content
    data = res.json()
    assert data["payment_url"].endswith("/A1")
    order = data["order"]
    assert order["status"] == "PENDING_PAYMENT" and order["can_pay"] is True
    assert order["items_count"] == 2 and len(order["items"]) == 2
    assert order["items"][1]["can_read"] is False
    assert order["timeline"][0]["status"] == "PENDING_PAYMENT"
    assert order["payment"] is None
    assert order["shipping_address"]["city"] == "تهران"
    assert again.json()["order"]["number"] == order["number"]
    assert Order.objects.count() == 1


def test_checkout_gateway_error(auth_api, books, methods, address):
    with mock.patch(START, side_effect=GatewayError()):
        res = auth_api.post(
            "/api/v1/checkout/", checkout_body(books, methods, address), format="json"
        )
    assert res.status_code == 502
    assert "درگاه" in res.json()["detail"]
    assert Order.objects.get().status == Order.Status.PENDING_PAYMENT


def test_checkout_problems(auth_api, books, methods, address):
    BookVariant.objects.filter(pk=books["civil_print"].pk).update(stock=0)
    res = auth_api.post("/api/v1/checkout/", checkout_body(books, methods, address), format="json")
    assert res.status_code == 400
    assert res.json()["problems"][0]["code"] == "out_of_stock"


def _order(user, books):
    return checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )


def test_orders_list_and_detail_owner_only(auth_api, user, other_user, books):
    mine = _order(user, books)
    theirs = _order(other_user, books)
    res = auth_api.get("/api/v1/orders/")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1 and body["results"][0]["number"] == mine.number
    assert body["results"][0]["covers"][0]["subject_color"] == "#1F4E8C"
    assert auth_api.get(f"/api/v1/orders/{mine.number}/").status_code == 200
    assert auth_api.get(f"/api/v1/orders/{theirs.number}/").status_code == 404
    assert auth_api.post(f"/api/v1/orders/{theirs.number}/pay/").status_code == 404


def test_detail_after_paid(auth_api, user, books):
    order = _order(user, books)
    with mock.patch("apps.accounts.tasks.send_sms.delay"):
        state.mark_paid(order)
    data = auth_api.get(f"/api/v1/orders/{order.number}/").json()
    assert data["status"] == "DELIVERED" and data["status_label"] == "تحویل‌شده"
    assert data["items"][0]["can_read"] is True
    assert [t["status"] for t in data["timeline"]] == ["PENDING_PAYMENT", "PAID", "DELIVERED"]
    assert data["can_pay"] is False


def test_pay_retry(auth_api, user, books, methods, address):
    order = checkout.create_order(
        user,
        {
            "items": [{"variant_id": books["civil_print"].pk}],
            "address_id": address.pk,
            "shipping_method_id": methods["post"].pk,
        },
        uuid.uuid4(),
    )
    url = f"/api/v1/orders/{order.number}/pay/"
    with mock.patch(START, return_value="https://pay/x") as start:
        res = auth_api.post(url)
    assert res.status_code == 200 and res.json() == {"payment_url": "https://pay/x"}
    start.assert_called_once()

    with mock.patch(START, side_effect=GatewayError()):
        assert auth_api.post(url).status_code == 502

    BookVariant.objects.filter(pk=books["civil_print"].pk).update(stock=0)
    res = auth_api.post(url)
    assert res.status_code == 400 and res.json()["problems"][0]["code"] == "out_of_stock"

    state.cancel(order)
    assert auth_api.post(url).status_code == 400


def test_orders_require_login(books):
    assert APIClient().get("/api/v1/orders/").status_code == 401
