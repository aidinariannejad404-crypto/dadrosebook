"""Server-side analytics events sent to self-hosted Umami (``docs/phase-5-contract.md`` §3).

``track_server_event("purchase", {...}, url="/checkout/result")`` queues a Celery task that
POSTs to ``{UMAMI_HOST}/api/send``. Empty ``UMAMI_HOST`` or ``UMAMI_WEBSITE_ID`` → no-op.
Never raises: analytics must not break an order. Never send phone numbers, names or addresses.
"""

import logging

import requests
from django.conf import settings
from rest_framework.throttling import BaseThrottle

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 3
# Umami drops requests whose User-Agent looks like a bot, so a browser-like one is sent.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 DadroseServer/1.0"
)
LANGUAGE = "fa-IR"


def is_configured() -> bool:
    return bool(settings.UMAMI_HOST and settings.UMAMI_WEBSITE_ID)


def build_payload(name: str, data: dict | None, url: str = "/") -> dict:
    return {
        "type": "event",
        "payload": {
            "website": settings.UMAMI_WEBSITE_ID,
            "hostname": settings.SITE_HOST,
            "url": url,
            "name": name,
            "data": data or {},
            "language": LANGUAGE,
        },
    }


def send_event(payload: dict, *, client_ip: str = "") -> bool:
    """POST one event to Umami. Returns success; logs and swallows every error."""
    if not is_configured():
        return False
    headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
    if client_ip:
        headers["X-Forwarded-For"] = client_ip
    try:
        response = requests.post(
            f"{settings.UMAMI_HOST.rstrip('/')}/api/send",
            json=payload,
            headers=headers,
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — analytics must never break the caller
        logger.warning("Umami event %r not sent: %s", payload["payload"].get("name"), exc)
        return False
    return True


def track_server_event(name: str, data: dict | None, *, url: str = "/", request=None) -> None:
    """Queue an analytics event.

    ``request`` (optional) only supplies the client IP, forwarded to our own Umami for its
    country stats and session hash; it is not stored anywhere else.
    """
    if not is_configured():
        return
    client_ip = ""
    if request is not None:
        try:
            client_ip = BaseThrottle().get_ident(request) or ""
        except Exception:  # noqa: BLE001
            client_ip = ""
    try:
        from .tasks import send_analytics_event

        send_analytics_event.delay(build_payload(name, data, url), client_ip)
    except Exception as exc:  # noqa: BLE001 — broker down must not break the caller
        logger.warning("Umami event %r not queued: %s", name, exc)
