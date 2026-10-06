import uuid
from unittest import mock

import pytest

from apps.catalog.models import BookVariant
from apps.library.services.entitlements import has_entitlement
from apps.orders.models import DiscountCode, Order
from apps.orders.services import checkout

START = "apps.payments.services.payments.start_payment"


def print_data(books, methods, address, **kw):
    return {
        "items": [{"variant_id": books["civil_print"].pk, "quantity": 2}],
        "address_id": address.pk,
        "shipping_method_id": methods["post"].pk,
        **kw,
    }


def test_create_order_snapshots(user, books, methods, address):
    DiscountCode.objects.create(code="OFF", kind=DiscountCode.Kind.FIXED, value=100_000)
    order = checkout.create_order(
        user,
        print_data(books, methods, address, discount_code="off", customer_note=" سلام "),
        uuid.uuid4(),
    )
    assert order.status == Order.Status.PENDING_PAYMENT
    assert order.items_total == 4_000_000
    assert order.discount_total == 100_000 and order.discount_code_text == "OFF"
    assert order.shipping_total == 45000 and order.shipping_method_name == "پست پیشتاز"
    assert order.total == 4_000_000 - 100_000 + 45000
    assert order.shipping_address["postal_code"] == "1234567890"
    assert order.customer_note == "سلام"
    item = order.items.get()
    assert (item.title, item.variant_type, item.quantity) == ("حقوق مدنی دوجلدی", "PRINT", 2)
    assert (item.list_price, item.unit_price, item.line_total) == (2_200_000, 2_000_000, 4_000_000)
    log = order.status_logs.get()
    assert (log.from_status, log.to_status) == ("", "PENDING_PAYMENT")


def test_idempotent_checkout_key(user, other_user, books, methods, address):
    key = uuid.uuid4()
    first = checkout.create_order(user, print_data(books, methods, address), key)
    second = checkout.create_order(user, print_data(books, methods, address), key)
    assert first.pk == second.pk
    assert Order.objects.count() == 1
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(other_user, print_data(books, methods, address), key)
    assert "checkout_key" in exc.value.detail


def test_address_must_be_owned(other_user, books, methods, address):
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(other_user, print_data(books, methods, address), uuid.uuid4())
    assert exc.value.detail == {"address_id": [checkout.ADDRESS_NOT_FOUND]}


def test_shipping_required(user, books, methods, address):
    data = {"items": [{"variant_id": books["civil_bundle"].pk}]}
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(user, data, uuid.uuid4())
    assert set(exc.value.detail) == {"address_id", "shipping_method_id"}


def test_courier_not_allowed_outside_tehran(user, books, methods, shiraz_address):
    data = print_data(books, methods, shiraz_address, shipping_method_id=methods["courier"].pk)
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(user, data, uuid.uuid4())
    assert exc.value.detail == {"shipping_method_id": [checkout.METHOD_NOT_ALLOWED]}


def test_problems_block(user, books, methods, address):
    BookVariant.objects.filter(pk=books["civil_print"].pk).update(stock=1)
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(user, print_data(books, methods, address), uuid.uuid4())
    assert exc.value.detail["problems"][0]["code"] == "insufficient_stock"


def test_invalid_discount_is_field_error(user, books, methods, address):
    with pytest.raises(checkout.CheckoutError) as exc:
        checkout.create_order(
            user, print_data(books, methods, address, discount_code="NOPE"), uuid.uuid4()
        )
    assert exc.value.detail == {"discount_code": ["کد تخفیف معتبر نیست."]}


def test_ebook_only_needs_no_address(user, books):
    with mock.patch(START, return_value="https://pay.example/StartPay/A1") as start:
        order, url = checkout.checkout(
            user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
        )
    assert url == "https://pay.example/StartPay/A1"
    start.assert_called_once()
    assert not order.needs_shipping and order.shipping_address is None
    assert order.total == 990_000


def test_free_order_paid_immediately(user, books, django_capture_on_commit_callbacks):
    DiscountCode.objects.create(code="FREE", kind=DiscountCode.Kind.PERCENT, value=100)
    with (
        mock.patch(START) as start,
        mock.patch("apps.accounts.tasks.send_sms.delay"),
        django_capture_on_commit_callbacks(execute=True),
    ):
        order, url = checkout.checkout(
            user,
            {"items": [{"variant_id": books["civil_ebook"].pk}], "discount_code": "free"},
            uuid.uuid4(),
        )
    start.assert_not_called()
    assert url is None
    order.refresh_from_db()
    assert order.total == 0 and order.paid_at is not None
    assert order.status == Order.Status.DELIVERED
    assert has_entitlement(user, books["civil_book"])
