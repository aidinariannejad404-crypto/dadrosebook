from urllib.parse import parse_qs, urlparse

import pytest
from django.urls import reverse

from apps.payments.models import Payment
from apps.payments.services import payments as svc

pytestmark = pytest.mark.django_db

CALLBACK = "/api/v1/payments/zarinpal/callback/"


def _redirect_params(response):
    assert response.status_code == 302
    url = urlparse(response["Location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "http://shop.test/checkout/result"
    return {k: v[0] for k, v in parse_qs(url.query).items()}


def test_callback_url_is_routed():
    assert reverse("payments-callback") == CALLBACK


def test_callback_paid_redirect(api, fake_gateway, order, state_mocks):
    svc.start_payment(order)
    payment = order.payments.get()
    response = api.get(CALLBACK, {"Authority": payment.authority, "Status": "OK"})
    assert _redirect_params(response) == {"order": order.number, "status": "paid"}
    response = api.get(CALLBACK, {"Authority": payment.authority, "Status": "OK"})
    assert _redirect_params(response)["status"] == "paid"
    assert len(state_mocks["paid"]) == 1


def test_callback_cancel_redirect(api, fake_gateway, order, state_mocks):
    svc.start_payment(order)
    payment = order.payments.get()
    response = api.get(CALLBACK, {"Authority": payment.authority, "Status": "NOK"})
    assert _redirect_params(response) == {"order": order.number, "status": "cancelled"}


def test_callback_unknown_maps_to_pending(api, fake_gateway, order, state_mocks, monkeypatch):
    from apps.payments.services.fake import FakeGateway
    from apps.payments.services.gateway import GatewayVerifyResult

    svc.start_payment(order)
    payment = order.payments.get()
    monkeypatch.setattr(
        FakeGateway, "verify", lambda self, a, amt: GatewayVerifyResult(ok=False, unknown=True)
    )
    response = api.get(CALLBACK, {"Authority": payment.authority, "Status": "OK"})
    assert _redirect_params(response)["status"] == "pending"


def test_callback_unknown_authority(api, fake_gateway):
    response = api.get(CALLBACK, {"Authority": "x", "Status": "OK"})
    assert _redirect_params(response) == {"status": "failed"}
    assert _redirect_params(api.get(CALLBACK)) == {"status": "failed"}


def test_callback_ignores_bad_auth_cookie(api, fake_gateway):
    api.cookies["dr_access"] = "garbage"
    response = api.get(CALLBACK, {"Authority": "x", "Status": "OK"})
    assert response.status_code == 302


def test_fake_page(api, fake_gateway, order):
    url = svc.start_payment(order)
    payment = order.payments.get()
    path = urlparse(url).path
    response = api.get(path)
    assert response.status_code == 200
    html = response.content.decode()
    assert 'dir="rtl"' in html
    assert order.number in html
    assert "۱٬۷۰۰٬۰۰۰ تومان" in html
    assert "پرداخت موفق" in html and "انصراف از پرداخت" in html
    assert f"{CALLBACK}?Authority={payment.authority}&amp;Status=OK" in html
    assert f"Authority={payment.authority}&amp;Status=NOK" in html


def test_fake_page_404_when_not_enabled(api, fake_gateway, order, settings):
    svc.start_payment(order)
    payment = order.payments.get()
    settings.PAYMENT_GATEWAY = "zarinpal"
    assert api.get(f"/api/v1/payments/fake/{payment.authority}/").status_code == 404


def test_fake_page_404_unknown_authority(api, fake_gateway):
    assert api.get("/api/v1/payments/fake/FAKE-nope/").status_code == 404


def test_full_fake_flow_real_state(api, fake_gateway, order):
    pytest.importorskip("apps.orders.services.state")
    svc.start_payment(order)
    payment = order.payments.get()
    response = api.get(CALLBACK, {"Authority": payment.authority, "Status": "OK"})
    assert _redirect_params(response)["status"] == "paid"
    payment.refresh_from_db()
    assert payment.status == Payment.Status.PAID
