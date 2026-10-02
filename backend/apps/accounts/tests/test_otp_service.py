import logging
from datetime import timedelta
from unittest import mock

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.models import OtpCode, User
from apps.accounts.services import otp

PHONE = "09121234567"

pytestmark = pytest.mark.django_db


def test_request_creates_hashed_code_and_sends_sms(sent_codes):
    data = otp.request_code("۰۹۱۲ ۱۲۳ ۴۵۶۷", ip="1.2.3.4")
    assert data == {"phone": PHONE, "expires_in": 120, "resend_in": 60, "length": 5}
    code = sent_codes[PHONE][0]
    assert len(code) == 5 and code.isdigit()
    row = OtpCode.objects.get()
    assert row.phone == PHONE and row.ip == "1.2.3.4"
    assert code not in row.code_hash
    assert row.code_hash == otp.hash_code(PHONE, code)


def test_request_rejects_invalid_phone():
    with pytest.raises(ValidationError):
        otp.request_code("12345")


def test_debug_echo_logs_code(sent_codes, caplog, settings):
    settings.OTP_DEBUG_ECHO = True
    with caplog.at_level(logging.WARNING, logger="apps.accounts.services.otp"):
        otp.request_code(PHONE)
    assert f"OTP for {PHONE}: {sent_codes[PHONE][0]}" in caplog.text


def test_no_echo_when_disabled(sent_codes, caplog, settings):
    settings.OTP_DEBUG_ECHO = False
    with caplog.at_level(logging.WARNING, logger="apps.accounts.services.otp"):
        otp.request_code(PHONE)
    assert "OTP for" not in caplog.text


def test_broker_failure_falls_back_to_sync_send(sent_codes):
    with mock.patch("apps.accounts.tasks.send_otp_sms.delay", side_effect=OSError("down")):
        otp.request_code(PHONE)
    assert len(sent_codes[PHONE]) == 1


def test_verify_creates_new_user(sent_codes):
    otp.request_code(PHONE)
    user, is_new = otp.verify_code(PHONE, sent_codes[PHONE][0])
    assert is_new and user.phone == PHONE
    assert not user.has_usable_password()
    assert OtpCode.objects.get().consumed_at is not None


def test_verify_existing_user(sent_codes):
    existing = User.objects.create_user(PHONE)
    otp.request_code(PHONE)
    user, is_new = otp.verify_code(PHONE, sent_codes[PHONE][0])
    assert not is_new and user == existing


def test_verify_accepts_persian_digits(sent_codes):
    otp.request_code(PHONE)
    fa = sent_codes[PHONE][0].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    user, _ = otp.verify_code("+98 912 123 4567", fa)
    assert user.phone == PHONE


def test_code_is_single_use(sent_codes):
    otp.request_code(PHONE)
    code = sent_codes[PHONE][0]
    otp.verify_code(PHONE, code)
    with pytest.raises(otp.OtpError) as exc:
        otp.verify_code(PHONE, code)
    assert exc.value.message == otp.MSG_NO_CODE


def test_wrong_code_counts_attempts_and_burns(sent_codes, settings):
    otp.request_code(PHONE)
    good = sent_codes[PHONE][0]
    bad = "00000" if good != "00000" else "11111"
    for i in range(settings.OTP_MAX_ATTEMPTS):
        with pytest.raises(otp.OtpError) as exc:
            otp.verify_code(PHONE, bad)
        expected = otp.MSG_BURNED if i == settings.OTP_MAX_ATTEMPTS - 1 else otp.MSG_WRONG
        assert exc.value.message == expected
    assert OtpCode.objects.get().attempts == settings.OTP_MAX_ATTEMPTS
    # Even the right code no longer works.
    with pytest.raises(otp.OtpError) as exc:
        otp.verify_code(PHONE, good)
    assert exc.value.message == otp.MSG_BURNED


def test_expired_code_rejected(sent_codes):
    otp.request_code(PHONE)
    later = timezone.now() + timedelta(seconds=121)
    with (
        mock.patch("django.utils.timezone.now", return_value=later),
        pytest.raises(otp.OtpError) as exc,
    ):
        otp.verify_code(PHONE, sent_codes[PHONE][0])
    assert exc.value.message == otp.MSG_EXPIRED


def test_new_request_invalidates_older_code(sent_codes, settings):
    settings.OTP_RESEND_SECONDS = 0
    otp.request_code(PHONE)
    otp.request_code(PHONE)
    first, second = sent_codes[PHONE]
    if first != second:
        with pytest.raises(otp.OtpError):
            otp.verify_code(PHONE, first)
    user, _ = otp.verify_code(PHONE, second)
    assert user.phone == PHONE
    assert OtpCode.objects.filter(expires_at__gt=timezone.now(), consumed_at=None).count() == 0


def test_resend_cooldown(sent_codes):
    otp.request_code(PHONE)
    with pytest.raises(otp.OtpThrottled) as exc:
        otp.request_code(PHONE)
    assert 0 < exc.value.retry_after <= 60
    # Another phone is not affected.
    otp.request_code("09120000000")


def test_hourly_limit_per_phone(sent_codes, settings):
    settings.OTP_RESEND_SECONDS = 0
    for _ in range(settings.OTP_MAX_PER_PHONE_PER_HOUR):
        otp.request_code(PHONE)
    with pytest.raises(otp.OtpThrottled) as exc:
        otp.request_code("۰۹۱۲۱۲۳۴۵۶۷")  # same phone, other spelling
    assert 3500 < exc.value.retry_after <= 3600
    assert OtpCode.objects.count() == settings.OTP_MAX_PER_PHONE_PER_HOUR


def test_inactive_user_rejected(sent_codes):
    User.objects.create_user(PHONE, is_active=False)
    otp.request_code(PHONE)
    with pytest.raises(otp.OtpError) as exc:
        otp.verify_code(PHONE, sent_codes[PHONE][0])
    assert exc.value.message == otp.MSG_INACTIVE


def test_verify_without_request():
    with pytest.raises(otp.OtpError) as exc:
        otp.verify_code(PHONE, "12345")
    assert exc.value.message == otp.MSG_NO_CODE


def test_generate_code_is_numeric():
    codes = {otp.generate_code() for _ in range(50)}
    assert all(len(c) == 5 and c.isdigit() for c in codes)
    assert len(codes) > 1


def test_send_sms_task(caplog):
    from apps.accounts.tasks import send_sms

    with caplog.at_level(logging.INFO, logger="apps.accounts.sms"):
        send_sms.delay(PHONE, "سلام")
    assert "سلام" in caplog.text
