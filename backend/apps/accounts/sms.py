"""SMS provider interface. Phase 1 ships only the console provider (logs instead of sending)."""

import logging
from abc import ABC, abstractmethod
from urllib.parse import urlsplit

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)


class SmsProvider(ABC):
    @abstractmethod
    def send(self, phone: str, message: str) -> None:
        """Send a plain text message."""

    def send_otp(self, phone: str, code: str) -> None:
        self.send(phone, otp_message(code))


def webotp_host() -> str:
    """The storefront host the code is bound to (``SITE_HOST``, else the host of ``FRONTEND_URL``)."""
    host = (getattr(settings, "SITE_HOST", "") or "").strip().lower()
    if not host:
        host = (urlsplit(getattr(settings, "FRONTEND_URL", "") or "").hostname or "").lower()
    # A bare host only: the origin-bound format has no scheme, path or port.
    return host.split("://")[-1].split("/")[0].split(":")[0]


def otp_message(code: str) -> str:
    """Login SMS: the admin-editable text plus the WebOTP origin-bound last line.

    The last line ``@<host> #<code>`` lets Android Chrome offer the code to the page
    (``navigator.credentials.get({otp})``); iOS ignores it and keeps the keyboard suggestion.
    The line is added in code so staff can never break it from the admin.
    """
    from apps.core.services.sms_templates import render_sms
    from apps.core.sms_catalog import KINDS, OTP_LOGIN

    try:
        text = render_sms(OTP_LOGIN, code=code)
    except Exception:  # noqa: BLE001 — a DB hiccup must never block a login code
        logger.exception("OTP SMS template lookup failed; using the default text")
        text = None
    # A login code must always go out: a disabled or code-less template falls back to the default.
    if not text or code not in text:
        text = KINDS[OTP_LOGIN].default.format(code=code)
    host = webotp_host()
    return f"{text}\n\n@{host} #{code}" if host else text


class ConsoleSmsProvider(SmsProvider):
    def send(self, phone: str, message: str) -> None:
        logger.info("SMS to %s: %s", phone, message)


PROVIDERS = {
    "console": "apps.accounts.sms.ConsoleSmsProvider",
}


def get_sms_provider() -> SmsProvider:
    """Instantiate the provider named by ``settings.SMS_PROVIDER`` (a key or a dotted path)."""
    name = getattr(settings, "SMS_PROVIDER", "console") or "console"
    path = PROVIDERS.get(name, name)
    return import_string(path)()
