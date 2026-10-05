import pytest

from apps.payments.services.fake import FakeGateway
from apps.payments.services.gateway import GatewayError, RefundNotSupported
from apps.payments.services.zarinpal import ZarinpalGateway


class _Payment:
    authority = "A1"


def test_fake_gateway_refunds():
    result = FakeGateway().refund(_Payment(), 50_000)
    assert result.ref_id.startswith("FAKE-REFUND-")
    assert result.raw["amount"] == 50_000


def test_zarinpal_refund_not_supported():
    with pytest.raises(RefundNotSupported) as exc:
        ZarinpalGateway().refund(_Payment(), 50_000)
    assert isinstance(exc.value, GatewayError)
    assert "شبا" in exc.value.message
