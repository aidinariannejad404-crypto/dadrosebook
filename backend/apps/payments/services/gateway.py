"""Payment gateway interface. Every gateway speaks **Rial**; the conversion from toman happens in
``apps.payments.services.payments`` (``apps.core.money.to_rial``) and nowhere else.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from django.conf import settings

GATEWAY_UNAVAILABLE_MESSAGE = (
    "اتصال به درگاه پرداخت برقرار نشد. لطفاً چند لحظه دیگر دوباره تلاش کنید."
)


class GatewayError(Exception):
    """The gateway refused or could not be reached. ``message`` is safe to show (Persian);
    ``details`` is for the logs/admin only."""

    def __init__(self, message: str = GATEWAY_UNAVAILABLE_MESSAGE, *, details: str = "", raw=None):
        super().__init__(message)
        self.message = message
        self.details = details
        self.raw = raw if raw is not None else {}


REFUND_NOT_SUPPORTED_MESSAGE = (
    "این درگاه استرداد خودکار وجه را پشتیبانی نمی‌کند. لطفاً مبلغ را به‌صورت دستی به شماره شبای "
    "مشتری واریز کنید و روش استرداد را «واریز به شبا» بگذارید."
)


class RefundNotSupported(GatewayError):
    """The gateway has no (implemented) refund API: staff refund manually by Shaba."""

    def __init__(self, message: str = REFUND_NOT_SUPPORTED_MESSAGE, **kwargs):
        super().__init__(message, **kwargs)


@dataclass
class GatewayRefundResult:
    ref_id: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class GatewayRequestResult:
    authority: str
    redirect_url: str
    raw: dict = field(default_factory=dict)


@dataclass
class GatewayVerifyResult:
    """``ok`` → paid (``already_verified`` when the gateway had verified it before).

    ``ok=False`` with ``unknown=True`` means the outcome is not known (network error, timeout):
    the payment must not be marked failed so a later callback retry can still succeed.
    """

    ok: bool
    already_verified: bool = False
    ref_id: str = ""
    card_pan: str = ""
    raw: dict = field(default_factory=dict)
    error: str = ""
    unknown: bool = False


class PaymentGateway(ABC):
    code: str = ""

    @abstractmethod
    def request(
        self,
        amount_rial: int,
        description: str,
        callback_url: str,
        mobile: str = "",
        order_number: str = "",
    ) -> GatewayRequestResult:
        """Open a payment; raise ``GatewayError`` when refused or unreachable."""

    @abstractmethod
    def verify(self, authority: str, amount_rial: int) -> GatewayVerifyResult:
        """Confirm a payment after the callback. Never raises for gateway answers."""

    def refund(self, payment, amount_rial: int) -> GatewayRefundResult:
        """Return ``amount_rial`` of a PAID ``payment`` to the payer's card.

        Raises ``GatewayError`` when refused; the default raises ``RefundNotSupported``.
        """
        raise RefundNotSupported()


def get_gateway(code: str | None = None) -> PaymentGateway:
    code = code or settings.PAYMENT_GATEWAY
    if code == "zarinpal":
        from .zarinpal import ZarinpalGateway

        return ZarinpalGateway()
    if code == "fake":
        from .fake import FakeGateway

        return FakeGateway()
    raise ValueError(f"Unknown PAYMENT_GATEWAY: {code!r}")
