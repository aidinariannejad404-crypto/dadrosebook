from unittest import mock

import pytest
import requests

from apps.payments.services.gateway import GatewayError, get_gateway
from apps.payments.services.zarinpal import ZarinpalGateway


def _response(body, status=200):
    resp = mock.Mock()
    resp.status_code = status
    resp.json.return_value = body
    return resp


@pytest.fixture
def zp(settings):
    settings.ZARINPAL_SANDBOX = True
    settings.ZARINPAL_MERCHANT_ID = "merchant-1"
    settings.ZARINPAL_TIMEOUT_SECONDS = 7
    return ZarinpalGateway()


def test_get_gateway(settings):
    settings.PAYMENT_GATEWAY = "zarinpal"
    assert get_gateway().code == "zarinpal"
    settings.PAYMENT_GATEWAY = "fake"
    assert get_gateway().code == "fake"
    with pytest.raises(ValueError):
        get_gateway("nope")


def test_request_success(zp):
    body = {"data": {"code": 100, "message": "Success", "authority": "A0000000001"}, "errors": []}
    with mock.patch("requests.post", return_value=_response(body)) as post:
        result = zp.request(17_000_000, "سفارش DR1", "http://cb/", "09121234567", "DR1")
    assert result.authority == "A0000000001"
    assert result.redirect_url == "https://sandbox.zarinpal.com/pg/StartPay/A0000000001"
    assert result.raw == body
    url = post.call_args.args[0]
    assert url == "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
    payload = post.call_args.kwargs["json"]
    assert payload == {
        "merchant_id": "merchant-1",
        "amount": 17_000_000,
        "currency": "IRR",
        "description": "سفارش DR1",
        "callback_url": "http://cb/",
        "metadata": {"mobile": "09121234567", "order_id": "DR1"},
    }
    assert post.call_args.kwargs["timeout"] == 7


def test_production_urls(settings):
    settings.ZARINPAL_SANDBOX = False
    body = {"data": {"code": 100, "authority": "A1"}, "errors": []}
    with mock.patch("requests.post", return_value=_response(body)) as post:
        result = ZarinpalGateway().request(10_000, "d", "http://cb/")
    assert post.call_args.args[0] == "https://payment.zarinpal.com/pg/v4/payment/request.json"
    assert result.redirect_url == "https://www.zarinpal.com/pg/StartPay/A1"


@pytest.mark.parametrize(
    "errors",
    [
        {"code": -9, "message": "The input params invalid, validation error.", "validations": []},
        [{"code": -10, "message": "Terminal is not valid"}],
    ],
)
def test_request_error_body(zp, errors):
    body = {"data": [], "errors": errors}
    with (
        mock.patch("requests.post", return_value=_response(body, 400)),
        pytest.raises(GatewayError) as exc,
    ):
        zp.request(10_000, "d", "http://cb/")
    assert "درگاه" in exc.value.message
    assert "-9" in exc.value.details or "-10" in exc.value.details


def test_request_timeout(zp):
    with (
        mock.patch("requests.post", side_effect=requests.Timeout("slow")),
        pytest.raises(GatewayError) as exc,
    ):
        zp.request(10_000, "d", "http://cb/")
    assert "network" in exc.value.details


def test_request_non_json(zp):
    resp = mock.Mock(status_code=502)
    resp.json.side_effect = ValueError("no json")
    with mock.patch("requests.post", return_value=resp), pytest.raises(GatewayError):
        zp.request(10_000, "d", "http://cb/")


def test_verify_paid(zp):
    body = {
        "data": {"code": 100, "message": "Verified", "card_pan": "502229******5995", "ref_id": 201},
        "errors": [],
    }
    with mock.patch("requests.post", return_value=_response(body)) as post:
        result = zp.verify("A1", 17_000_000)
    assert result.ok and not result.already_verified and not result.unknown
    assert result.ref_id == "201"
    assert result.card_pan == "502229******5995"
    assert post.call_args.args[0].endswith("/pg/v4/payment/verify.json")
    assert post.call_args.kwargs["json"] == {
        "merchant_id": "merchant-1",
        "amount": 17_000_000,
        "authority": "A1",
    }


def test_verify_already_verified(zp):
    body = {"data": {"code": 101, "ref_id": 201, "card_pan": "x"}, "errors": []}
    with mock.patch("requests.post", return_value=_response(body)):
        result = zp.verify("A1", 10)
    assert result.ok and result.already_verified


@pytest.mark.parametrize(
    "body",
    [
        {"data": [], "errors": {"code": -51, "message": "Session is not valid"}},
        {"data": [], "errors": [{"code": -50, "message": "amount mismatch"}]},
        {"data": {"code": -52}, "errors": []},
    ],
)
def test_verify_failed(zp, body):
    with mock.patch("requests.post", return_value=_response(body, 400)):
        result = zp.verify("A1", 10)
    assert not result.ok and not result.unknown
    assert result.error


def test_verify_timeout_is_unknown(zp):
    with mock.patch("requests.post", side_effect=requests.ConnectionError("down")):
        result = zp.verify("A1", 10)
    assert not result.ok and result.unknown
    assert "network" in result.error


def test_verify_server_error_is_unknown(zp):
    with mock.patch("requests.post", return_value=_response({"data": [], "errors": []}, 503)):
        result = zp.verify("A1", 10)
    assert not result.ok and result.unknown
