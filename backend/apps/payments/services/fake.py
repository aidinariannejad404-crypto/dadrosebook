"""Local payment simulator for development without internet (``PAYMENT_GATEWAY=fake``).

``request`` returns a page on our own API (``/payments/fake/<authority>/``) with «پرداخت موفق» /
«انصراف از پرداخت» buttons that hit the normal callback. ``verify`` always succeeds unless the
authority was marked failed (``FakeGateway.mark_failed``, handy in tests).
"""

from __future__ import annotations

import secrets
import uuid

from django.conf import settings
from django.core.cache import cache

from .gateway import GatewayRequestResult, GatewayVerifyResult, PaymentGateway

_FAILED_KEY = "payments:fake:failed:{}"
_VERIFIED_KEY = "payments:fake:verified:{}"


class FakeGateway(PaymentGateway):
    code = "fake"

    @staticmethod
    def mark_failed(authority: str) -> None:
        cache.set(_FAILED_KEY.format(authority), True, 24 * 3600)

    def request(
        self,
        amount_rial: int,
        description: str,
        callback_url: str,
        mobile: str = "",
        order_number: str = "",
    ) -> GatewayRequestResult:
        authority = f"FAKE-{uuid.uuid4().hex}"
        base = settings.PUBLIC_API_URL.rstrip("/")
        return GatewayRequestResult(
            authority=authority,
            redirect_url=f"{base}/payments/fake/{authority}/",
            raw={
                "fake": True,
                "amount": amount_rial,
                "description": description,
                "callback_url": callback_url,
                "order_id": order_number,
            },
        )

    def verify(self, authority: str, amount_rial: int) -> GatewayVerifyResult:
        if cache.get(_FAILED_KEY.format(authority)):
            return GatewayVerifyResult(
                ok=False, raw={"fake": True, "code": -51}, error="-51 fake payment failed"
            )
        key = _VERIFIED_KEY.format(authority)
        already = bool(cache.get(key))
        cache.set(key, True, 24 * 3600)
        return GatewayVerifyResult(
            ok=True,
            already_verified=already,
            ref_id=str(secrets.randbelow(10**9) + 10**9),
            card_pan="603799******0000",
            raw={"fake": True, "code": 101 if already else 100, "amount": amount_rial},
        )
