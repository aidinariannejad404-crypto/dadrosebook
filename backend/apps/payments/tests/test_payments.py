from unittest import mock

import pytest

from apps.orders.models import Order
from apps.payments.models import Payment, PaymentLog
from apps.payments.services import payments as svc
from apps.payments.services.fake import FakeGateway
from apps.payments.services.gateway import GatewayError, GatewayVerifyResult

pytestmark = pytest.mark.django_db


def _assert_every_status_change_logged(payment):
    """Each status the payment went through has a PaymentLog row ending in it."""
    logs = list(PaymentLog.objects.filter(payment=payment))
    changes = [log for log in logs if log.from_status != log.to_status]
    chain = [""] + [log.to_status for log in changes]
    for log, prev in zip(changes, chain, strict=False):
        assert log.from_status == prev
    assert changes[-1].to_status == payment.status


def test_start_payment_fake(fake_gateway, order):
    url = svc.start_payment(order)
    payment = order.payments.get()
    assert payment.gateway == "fake"
    assert payment.amount_rial == order.total * 10
    assert payment.status == Payment.Status.REDIRECTED
    assert payment.authority.startswith("FAKE-")
    assert url == f"http://api.test/api/v1/payments/fake/{payment.authority}/"
    assert (
        payment.raw_request["callback_url"] == "http://api.test/api/v1/payments/zarinpal/callback/"
    )
    events = list(payment.logs.values_list("event", "from_status", "to_status"))
    assert events == [
        ("created", "", "INITIATED"),
        ("redirected", "INITIATED", "REDIRECTED"),
    ]


def test_start_payment_passes_description_and_mobile(fake_gateway, order):
    with mock.patch.object(FakeGateway, "request", autospec=True) as request:
        request.return_value = mock.Mock(authority="AUTH1", redirect_url="u", raw={"a": 1})
        svc.start_payment(order)
    kwargs = request.call_args.kwargs
    assert kwargs["amount_rial"] == 17_000_000
    assert kwargs["description"] == f"سفارش {order.number} — کتاب دادرُز"
    assert kwargs["mobile"] == "09121234567"
    assert kwargs["order_number"] == order.number


def test_start_payment_gateway_error(fake_gateway, order):
    error = GatewayError(details="-9 bad", raw={"errors": 1})
    with (
        mock.patch.object(FakeGateway, "request", side_effect=error),
        pytest.raises(GatewayError),
    ):
        svc.start_payment(order)
    payment = order.payments.get()
    assert payment.status == Payment.Status.FAILED
    assert payment.error == "-9 bad"
    order.refresh_from_db()
    assert order.status == Order.Status.PENDING_PAYMENT
    _assert_every_status_change_logged(payment)


@pytest.mark.parametrize(
    ("status", "total"),
    [(Order.Status.PAID, 1000), (Order.Status.PENDING_PAYMENT, 0), (Order.Status.FAILED, 1000)],
)
def test_start_payment_refused(fake_gateway, make_order, status, total):
    with pytest.raises(svc.PaymentNotAllowed):
        svc.start_payment(make_order(total=total, status=status))
    assert not Payment.objects.exists()


def _started(order):
    svc.start_payment(order)
    return order.payments.get()


def test_callback_paid_is_idempotent(fake_gateway, order, state_mocks):
    payment = _started(order)
    with mock.patch.object(FakeGateway, "verify", wraps=FakeGateway().verify) as verify:
        assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
        assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
        assert svc.handle_callback(payment.authority, "NOK")[1] == "paid"
    assert verify.call_count == 1
    assert verify.call_args.args == (payment.authority, order.total * 10)
    assert state_mocks["paid"] == [(order.pk, payment.pk)]
    payment.refresh_from_db()
    assert payment.status == Payment.Status.PAID
    assert payment.ref_id and payment.card_pan and payment.verified_at
    assert payment.logs.filter(event="callback").count() == 3
    _assert_every_status_change_logged(payment)


def test_callback_nok_cancels(fake_gateway, order, state_mocks):
    payment = _started(order)
    with mock.patch.object(FakeGateway, "verify") as verify:
        found, outcome = svc.handle_callback(payment.authority, "NOK")
    assert (found.pk, outcome) == (order.pk, "cancelled")
    verify.assert_not_called()
    payment.refresh_from_db()
    assert payment.status == Payment.Status.CANCELLED
    # the order stays payable so the customer can retry
    assert state_mocks["failed"] == []
    # a second callback does nothing more
    assert svc.handle_callback(payment.authority, "OK")[1] == "cancelled"
    _assert_every_status_change_logged(payment)


def test_callback_verify_failure(fake_gateway, order, state_mocks):
    payment = _started(order)
    FakeGateway.mark_failed(payment.authority)
    assert svc.handle_callback(payment.authority, "OK")[1] == "failed"
    payment.refresh_from_db()
    assert payment.status == Payment.Status.FAILED
    assert "-51" in payment.error
    assert state_mocks["failed"] == []  # order stays payable
    assert state_mocks["paid"] == []
    _assert_every_status_change_logged(payment)


def test_callback_unknown_then_retry(fake_gateway, order, state_mocks):
    payment = _started(order)
    unknown = GatewayVerifyResult(ok=False, unknown=True, error="network: timeout")
    with mock.patch.object(FakeGateway, "verify", return_value=unknown):
        assert svc.handle_callback(payment.authority, "OK")[1] == "unknown"
    payment.refresh_from_db()
    assert payment.status == Payment.Status.REDIRECTED
    assert payment.error == "network: timeout"
    assert payment.logs.filter(event="verify_error").exists()
    assert state_mocks["failed"] == [] and state_mocks["paid"] == []

    assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
    payment.refresh_from_db()
    assert payment.status == Payment.Status.PAID
    assert payment.error == ""
    assert len(state_mocks["paid"]) == 1
    _assert_every_status_change_logged(payment)


def test_callback_unknown_authority(fake_gateway, state_mocks):
    with pytest.raises(svc.PaymentNotFound):
        svc.handle_callback("nope", "OK")
    with pytest.raises(svc.PaymentNotFound):
        svc.handle_callback("", "OK")


def test_cancel_does_not_fail_order_with_another_paid_payment(fake_gateway, order, state_mocks):
    first = _started(order)
    second = _started_again(order)
    svc.handle_callback(first.authority, "OK")
    assert svc.handle_callback(second.authority, "NOK")[1] == "cancelled"
    assert state_mocks["failed"] == []


def _started_again(order):
    svc.start_payment(order)
    return order.payments.order_by("-id").first()


def test_second_successful_payment_is_flagged_not_paid(fake_gateway, order, state_mocks):
    first = _started(order)
    second = _started_again(order)
    svc.handle_callback(first.authority, "OK")
    assert svc.handle_callback(second.authority, "OK")[1] == "paid"
    second.refresh_from_db()
    assert second.status == Payment.Status.FAILED
    assert "بازگشت وجه" in second.error
    assert second.logs.filter(event="duplicate_paid").exists()
    assert len(state_mocks["paid"]) == 1


def test_callback_uses_payment_gateway_not_setting(fake_gateway, order, state_mocks, settings):
    payment = _started(order)
    settings.PAYMENT_GATEWAY = "zarinpal"
    with mock.patch("requests.post") as post:
        assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
    post.assert_not_called()


def test_integration_with_real_mark_paid(fake_gateway, order):
    state = pytest.importorskip("apps.orders.services.state")
    if not hasattr(state, "mark_paid") or not hasattr(state, "mark_failed"):
        pytest.skip("apps.orders.services.state.mark_paid not available yet")
    payment = _started(order)
    assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
    assert svc.handle_callback(payment.authority, "OK")[1] == "paid"
    order.refresh_from_db()
    assert order.paid_at is not None
    assert order.status in (Order.Status.PAID, Order.Status.DELIVERED)
    assert order.status_logs.filter(to_status=Order.Status.PAID).count() == 1


def test_cancel_keeps_order_payable(fake_gateway, order):
    payment = _started(order)
    assert svc.handle_callback(payment.authority, "NOK")[1] == "cancelled"
    order.refresh_from_db()
    assert order.status == Order.Status.PENDING_PAYMENT
    # a new attempt can start
    assert svc.start_payment(order)
