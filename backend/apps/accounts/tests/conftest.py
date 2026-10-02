import re

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import tokens


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _otp_settings(settings):
    settings.OTP_DEBUG_ECHO = True
    settings.SMS_PROVIDER = "console"


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user("09121234567", first_name="علی", last_name="رضایی")


@pytest.fixture
def auth_api(user):
    client = APIClient()
    access, refresh = tokens.issue_pair(user)
    client.cookies["dr_access"] = access
    client.cookies["dr_refresh"] = refresh
    return client


@pytest.fixture
def sent_codes(monkeypatch):
    """Capture codes sent through the SMS provider: ``{phone: [code, …]}``."""
    from apps.accounts.sms import ConsoleSmsProvider

    sent: dict[str, list[str]] = {}

    def fake_send(self, phone, message):
        sent.setdefault(phone, []).append(re.search(r"\d{5}", message).group())

    monkeypatch.setattr(ConsoleSmsProvider, "send", fake_send)
    return sent
