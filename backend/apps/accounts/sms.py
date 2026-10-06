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
        """Send a plain text message (store notifications)."""

    def send_otp(self, phone: str, code: str) -> None:
        """Send a login code on the **service line** (PF-1).

        Real providers must override this with their verify/template API (e.g. Kavenegar
        ``verify/lookup``, sms.ir ``verify``): those go out on a service line that is delivered even
        when the customer blocked advertising SMS. Never route login codes through a bulk or
        advertising line. The console provider just logs the text.
        """
        self.send(phone, otp_message(code))

    # --- PF-1: voice-call fallback (optional) ----------------------------------------------------
    #: Providers that can read the code out in a phone call set this to True.
    supports_voice_otp: bool = False

    def send_voice_otp(self, phone: str, code: str) -> None:
        """Read the login code out in an automated phone call (fallback when SMS does not arrive).

        Optional: the storefront offers it only when ``settings.OTP_VOICE_ENABLED`` is on *and*
        the provider sets ``supports_voice_otp``.
        """
        raise NotImplementedError("This SMS provider has no voice-call OTP.")


def webotp_host() -> str:
    """Storefront host the code is bound to: ``SITE_HOST``, else the ``FRONTEND_URL`` host."""
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
    except Exception:  # a DB hiccup must never block a login code
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


def voice_otp_available() -> bool:
    """True when the storefront may offer «دریافت کد با تماس صوتی» (PF-1)."""
    if not getattr(settings, "OTP_VOICE_ENABLED", False):
        return False
    try:
        return bool(get_sms_provider().supports_voice_otp)
    except Exception:  # a misconfigured provider must not break the login form
        logger.exception("Could not load the SMS provider")
        return False


# --- PF-2 / PF-3: the one place every store notification SMS goes through ---
def deliver_sms(
    phone: str,
    message: str,
    *,
    kind: str | None = None,
    link: str = "",
    code: str = "",
    provider: SmsProvider | None = None,
) -> bool:
    """Send a store notification SMS (an ``apps.core.sms_catalog`` kind); False when skipped.

    Before sending, every hook in ``settings.SMS_DELIVERY_HOOKS`` is called with
    ``(phone, message, kind=, link=, code=)``. The inbox hook stores the message in the customer's
    «پیام‌های من» and returns False when the customer muted this (marketing) kind, which skips the
    SMS. Login codes never come here (``SmsProvider.send_otp``).
    """
    for path in getattr(settings, "SMS_DELIVERY_HOOKS", ()):
        try:
            allowed = import_string(path)(phone, message, kind=kind, link=link, code=code)
        except Exception:  # a broken hook must not stop an order SMS
            logger.exception("SMS delivery hook %s failed", path)
            continue
        if allowed is False:
            return False
    (provider or get_sms_provider()).send(phone, message)
    return True
