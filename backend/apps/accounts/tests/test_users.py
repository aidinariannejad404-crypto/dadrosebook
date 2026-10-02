import logging

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.phone import normalize_phone, validate_phone
from apps.accounts.sms import ConsoleSmsProvider, get_sms_provider


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("09120000000", "09120000000"),
        ("۰۹۱۲ ۰۰۰ ۰۰۰۰", "09120000000"),
        ("+989120000000", "09120000000"),
        ("00989120000000", "09120000000"),
        ("9120000000", "09120000000"),
        ("0912-000-0000", "09120000000"),
    ],
)
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("bad", ["0912000000", "08120000000", "abc", ""])
def test_validate_phone_rejects(bad):
    with pytest.raises(ValidationError):
        validate_phone(normalize_phone(bad))


@pytest.mark.django_db
def test_create_user_normalises_phone_and_has_no_password():
    user = User.objects.create_user("۰۹۱۲۱۱۱۲۲۳۳", password="ignored")
    assert user.phone == "09121112233"
    assert not user.has_usable_password()
    assert not user.is_staff


@pytest.mark.django_db
def test_create_superuser_has_password():
    admin = User.objects.create_superuser("09120000000", "secret-pass")
    assert admin.is_staff and admin.is_superuser
    assert admin.check_password("secret-pass")


@pytest.mark.django_db
def test_create_user_rejects_invalid_phone():
    with pytest.raises(ValidationError):
        User.objects.create_user("12345")


def test_console_sms_provider_logs(caplog, settings):
    settings.SMS_PROVIDER = "console"
    provider = get_sms_provider()
    assert isinstance(provider, ConsoleSmsProvider)
    with caplog.at_level(logging.INFO, logger="apps.accounts.sms"):
        provider.send_otp("09120000000", "12345")
    assert "12345" in caplog.text
