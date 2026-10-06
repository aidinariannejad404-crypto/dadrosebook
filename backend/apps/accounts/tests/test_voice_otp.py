"""PF-1: OTP on the provider's service-line method, optional voice-call fallback."""

import pytest

from apps.accounts.services import otp
from apps.accounts.sms import ConsoleSmsProvider, SmsProvider, voice_otp_available

PHONE = "09121234567"
calls: list[tuple[str, str, str]] = []


class VoiceSms(SmsProvider):
    supports_voice_otp = True

    def send(self, phone, message):
        calls.append(("sms", phone, message))

    def send_otp(self, phone, code):
        calls.append(("otp", phone, code))

    def send_voice_otp(self, phone, code):
        calls.append(("voice", phone, code))


@pytest.fixture(autouse=True)
def _reset():
    calls.clear()


def test_console_provider_has_no_voice():
    with pytest.raises(NotImplementedError):
        ConsoleSmsProvider().send_voice_otp(PHONE, "12345")
    assert ConsoleSmsProvider.supports_voice_otp is False


def test_voice_off_by_default(db, settings, api):
    settings.SMS_PROVIDER = "apps.accounts.tests.test_voice_otp.VoiceSms"
    assert voice_otp_available() is False
    with pytest.raises(otp.VoiceUnavailable):
        otp.request_code(PHONE, channel="voice")
    res = api.post("/api/v1/auth/otp/voice/", {"phone": PHONE}, format="json")
    assert res.status_code == 404


def test_login_code_uses_send_otp_not_send(db, settings):
    settings.SMS_PROVIDER = "apps.accounts.tests.test_voice_otp.VoiceSms"
    otp.request_code(PHONE)
    assert [c[0] for c in calls] == ["otp"]


def test_voice_call_when_enabled(db, settings, api):
    settings.SMS_PROVIDER = "apps.accounts.tests.test_voice_otp.VoiceSms"
    settings.OTP_VOICE_ENABLED = True
    res = api.post("/api/v1/auth/otp/voice/", {"phone": PHONE}, format="json")
    assert res.status_code == 200
    assert res.json()["channel"] == "voice" and res.json()["voice_available"] is True
    kind, phone, code = calls[0]
    assert kind == "voice" and phone == PHONE
    user, _ = otp.verify_code(PHONE, code)
    assert user.phone == PHONE


def test_voice_enabled_but_console_provider(settings):
    settings.OTP_VOICE_ENABLED = True
    settings.SMS_PROVIDER = "console"
    assert voice_otp_available() is False
