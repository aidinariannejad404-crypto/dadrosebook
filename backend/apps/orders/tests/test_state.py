import datetime as dt
import uuid
from unittest import mock

import pytest
from django.utils import timezone

from apps.catalog.models import Book, BookVariant
from apps.library.models import EbookEntitlement
from apps.orders.models import DiscountCode, DiscountRedemption, Order
from apps.orders.services import checkout, state

SMS = "apps.accounts.tasks.send_sms.delay"


@pytest.fixture
def bundle_order(user, books, methods, address):
    DiscountCode.objects.create(code="OFF", kind=DiscountCode.Kind.FIXED, value=100_000)
    return checkout.create_order(
        user,
        {
            "items": [
                {"variant_id": books["civil_bundle"].pk, "quantity": 2},
                {"variant_id": books["commerce_ebook"].pk},
            ],
            "address_id": address.pk,
            "shipping_method_id": methods["post"].pk,
            "discount_code": "OFF",
        },
        uuid.uuid4(),
    )


def test_mark_paid_idempotent(bundle_order, books, django_capture_on_commit_callbacks):
    received = []

    def receiver(sender, order, **kw):
        received.append(order.number)

    from apps.orders.signals import order_paid

    order_paid.connect(receiver)
    try:
        with mock.patch(SMS) as sms, django_capture_on_commit_callbacks(execute=True):
            assert state.mark_paid(bundle_order) is True
            assert state.mark_paid(bundle_order) is False
            assert state.mark_paid(Order.objects.get(pk=bundle_order.pk)) is False
    finally:
        order_paid.disconnect(receiver)

    assert received == [bundle_order.number]
    sms.assert_called_once()
    assert bundle_order.number in sms.call_args.args[1]
    bundle_order.refresh_from_db()
    assert bundle_order.status == Order.Status.PAID  # needs shipping: stays PAID
    assert BookVariant.objects.get(pk=books["civil_bundle"].pk).stock == 3
    assert DiscountRedemption.objects.filter(order=bundle_order).count() == 1
    assert DiscountCode.objects.get(code="OFF").used_count == 1
    assert EbookEntitlement.objects.filter(user=bundle_order.user).count() == 2
    assert Book.objects.get(pk=books["civil_book"].pk).sales_count == 2
    assert Book.objects.get(pk=books["commerce_book"].pk).sales_count == 1
    assert list(bundle_order.status_logs.values_list("to_status", flat=True)) == [
        "PENDING_PAYMENT",
        "PAID",
    ]


def test_ebook_only_goes_delivered(user, books):
    order = checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )
    with mock.patch(SMS):
        state.mark_paid(order)
    order.refresh_from_db()
    assert order.status == Order.Status.DELIVERED and order.delivered_at
    assert list(order.status_logs.values_list("to_status", flat=True)) == [
        "PENDING_PAYMENT",
        "PAID",
        "DELIVERED",
    ]


def test_late_payment_after_cancel(bundle_order):
    state.cancel(bundle_order, note="test")
    assert bundle_order.status == Order.Status.CANCELLED
    with mock.patch(SMS):
        assert state.mark_paid(bundle_order) is True
    bundle_order.refresh_from_db()
    assert bundle_order.status == Order.Status.PAID
    assert state.LATE_PAYMENT_NOTE in bundle_order.staff_note
    assert state.LATE_PAYMENT_NOTE in bundle_order.status_logs.last().note


def test_late_payment_after_failed(bundle_order):
    assert state.mark_failed(bundle_order, "NOK") is True
    assert state.mark_failed(bundle_order, "NOK") is False
    with mock.patch(SMS):
        assert state.mark_paid(bundle_order) is True


def test_stock_shortfall_note(bundle_order, books):
    BookVariant.objects.filter(pk=books["civil_bundle"].pk).update(stock=1)
    with mock.patch(SMS):
        assert state.mark_paid(bundle_order) is True
    bundle_order.refresh_from_db()
    assert bundle_order.status == Order.Status.PAID
    assert "کمبود موجودی" in bundle_order.staff_note
    assert BookVariant.objects.get(pk=books["civil_bundle"].pk).stock == 0


def test_admin_transitions(bundle_order, django_capture_on_commit_callbacks):
    with mock.patch(SMS):
        state.mark_paid(bundle_order)
    with pytest.raises(state.TransitionError):
        state.transition(bundle_order, Order.Status.PENDING_PAYMENT)
    state.transition(bundle_order, Order.Status.PROCESSING)
    with pytest.raises(state.TransitionError, match="کد رهگیری"):
        state.transition(bundle_order, Order.Status.SHIPPED)
    Order.objects.filter(pk=bundle_order.pk).update(tracking_code="TRK123")
    with mock.patch(SMS) as sms, django_capture_on_commit_callbacks(execute=True):
        state.transition(bundle_order, Order.Status.SHIPPED)
    assert "TRK123" in sms.call_args.args[1]
    assert bundle_order.shipped_at is not None
    state.transition(bundle_order, Order.Status.DELIVERED)
    assert bundle_order.delivered_at is not None
    with pytest.raises(state.TransitionError):
        state.cancel(bundle_order)


def test_expire_unpaid(bundle_order, user, books, settings):
    settings.ORDER_PAYMENT_TIMEOUT_MINUTES = 60
    fresh = checkout.create_order(
        user, {"items": [{"variant_id": books["civil_ebook"].pk}]}, uuid.uuid4()
    )
    Order.objects.filter(pk=bundle_order.pk).update(
        created_at=timezone.now() - dt.timedelta(minutes=61)
    )
    assert state.expire_unpaid() == 1
    bundle_order.refresh_from_db()
    fresh.refresh_from_db()
    assert bundle_order.status == Order.Status.CANCELLED and bundle_order.cancelled_at
    assert bundle_order.status_logs.last().note == state.EXPIRED_NOTE
    assert fresh.status == Order.Status.PENDING_PAYMENT
    assert state.expire_unpaid() == 0


def test_expire_task_and_command(bundle_order):
    from django.core.management import call_command

    from apps.orders.tasks import expire_unpaid_orders

    Order.objects.filter(pk=bundle_order.pk).update(
        created_at=timezone.now() - dt.timedelta(days=1)
    )
    assert expire_unpaid_orders.delay().get() == 1
    call_command("expire_unpaid_orders")


def test_can_pay(bundle_order, settings):
    settings.ORDER_PAYMENT_TIMEOUT_MINUTES = 60
    assert state.can_pay(bundle_order)
    later = timezone.now() + dt.timedelta(minutes=61)
    assert not state.can_pay(bundle_order, now=later)
