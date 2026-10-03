"""ZarinPal REST v4 adapter (https://www.zarinpal.com/docs/paymentGateway/).

Amounts are Rial (``currency: "IRR"``). Sandbox when ``settings.ZARINPAL_SANDBOX``.
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings

from .gateway import (
    GATEWAY_UNAVAILABLE_MESSAGE,
    GatewayError,
    GatewayRequestResult,
    GatewayVerifyResult,
    PaymentGateway,
)

logger = logging.getLogger(__name__)

CODE_OK = 100
CODE_ALREADY_VERIFIED = 101


def _api_base() -> str:
    host = "sandbox" if settings.ZARINPAL_SANDBOX else "payment"
    return f"https://{host}.zarinpal.com/pg/v4/payment"


def _startpay_base() -> str:
    host = "sandbox" if settings.ZARINPAL_SANDBOX else "www"
    return f"https://{host}.zarinpal.com/pg/StartPay"


def _errors_text(errors) -> str:
    """``errors``: ``[]`` on success, else a dict ``{code, message, validations}`` or a list."""
    if not errors:
        return ""
    items = errors if isinstance(errors, list) else [errors]
    parts = []
    for item in items:
        if isinstance(item, dict):
            parts.append(f"{item.get('code', '')} {item.get('message', '')}".strip())
        else:
            parts.append(str(item))
    return "; ".join(p for p in parts if p)[:300]


def _errors_code(errors):
    items = errors if isinstance(errors, list) else [errors]
    for item in items:
        if isinstance(item, dict) and item.get("code") is not None:
            return item["code"]
    return None


class ZarinpalGateway(PaymentGateway):
    code = "zarinpal"

    def __init__(self, merchant_id: str | None = None, timeout: int | None = None):
        self.merchant_id = merchant_id or settings.ZARINPAL_MERCHANT_ID
        self.timeout = timeout or settings.ZARINPAL_TIMEOUT_SECONDS

    def _post(self, endpoint: str, payload: dict) -> tuple[int, dict]:
        """POST JSON; returns (http status, body). Raises ``requests.RequestException`` or
        ``ValueError`` (body is not JSON)."""
        response = requests.post(
            f"{_api_base()}/{endpoint}",
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=self.timeout,
        )
        body = response.json()
        if not isinstance(body, dict):
            raise ValueError("unexpected body")
        return response.status_code, body

    def request(
        self,
        amount_rial: int,
        description: str,
        callback_url: str,
        mobile: str = "",
        order_number: str = "",
    ) -> GatewayRequestResult:
        metadata = {}
        if mobile:
            metadata["mobile"] = mobile
        if order_number:
            metadata["order_id"] = order_number
        payload = {
            "merchant_id": self.merchant_id,
            "amount": int(amount_rial),
            "currency": "IRR",
            "description": description,
            "callback_url": callback_url,
            "metadata": metadata,
        }
        try:
            status_code, body = self._post("request.json", payload)
        except (requests.RequestException, ValueError) as exc:
            logger.warning("zarinpal request failed for %s: %r", order_number, exc)
            raise GatewayError(details=f"network: {exc!r}"[:300]) from exc

        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        if data.get("code") == CODE_OK and data.get("authority"):
            authority = str(data["authority"])
            return GatewayRequestResult(
                authority=authority, redirect_url=f"{_startpay_base()}/{authority}", raw=body
            )
        details = _errors_text(body.get("errors")) or f"http {status_code}: code {data.get('code')}"
        logger.warning("zarinpal refused request for %s: %s", order_number, details)
        raise GatewayError(GATEWAY_UNAVAILABLE_MESSAGE, details=details, raw=body)

    def verify(self, authority: str, amount_rial: int) -> GatewayVerifyResult:
        payload = {
            "merchant_id": self.merchant_id,
            "amount": int(amount_rial),
            "authority": authority,
        }
        try:
            status_code, body = self._post("verify.json", payload)
        except (requests.RequestException, ValueError) as exc:
            logger.warning("zarinpal verify failed for %s: %r", authority, exc)
            return GatewayVerifyResult(ok=False, unknown=True, error=f"network: {exc!r}"[:300])

        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        code = data.get("code")
        if code in (CODE_OK, CODE_ALREADY_VERIFIED):
            return GatewayVerifyResult(
                ok=True,
                already_verified=code == CODE_ALREADY_VERIFIED,
                ref_id=str(data.get("ref_id") or ""),
                card_pan=str(data.get("card_pan") or ""),
                raw=body,
            )
        errors = body.get("errors")
        error_code = _errors_code(errors) if errors else code
        error = _errors_text(errors) or f"http {status_code}: code {code}"
        if error_code is None and status_code >= 500:
            # The gateway itself is down; the outcome is not known yet.
            return GatewayVerifyResult(ok=False, unknown=True, raw=body, error=error)
        return GatewayVerifyResult(ok=False, raw=body, error=error)
