"""SMS provider interface. Phase 1 ships only the console provider (logs instead of sending)."""

import logging
from abc import ABC, abstractmethod

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)


class SmsProvider(ABC):
    @abstractmethod
    def send(self, phone: str, message: str) -> None:
        """Send a plain text message."""

    def send_otp(self, phone: str, code: str) -> None:
        self.send(phone, f"کد ورود شما به دادرُز: {code}")


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
