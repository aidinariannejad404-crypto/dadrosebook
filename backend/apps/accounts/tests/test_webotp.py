"""ج۱ — the login SMS ends with the WebOTP origin-bound line."""

import pytest

from apps.accounts.sms import otp_message, webotp_host
from apps.core.models import SmsTemplate
from apps.core.sms_catalog import OTP_LOGIN


def test_host_prefers_site_host(settings):
    settings.SITE_HOST = "dadrosebook.com"
    settings.FRONTEND_URL = "http://localhost:3000"
    assert webotp_host() == "dadrosebook.com"


def test_host_falls_back_to_frontend_url_without_port(settings):
    settings.SITE_HOST = ""
    settings.FRONTEND_URL = "https://www.DadroseBook.com:443/shop"
    assert webotp_host() == "www.dadrosebook.com"


@pytest.mark.django_db
def test_message_ends_with_origin_bound_line(settings):
    settings.SITE_HOST = "dadrosebook.com"
    text = otp_message("12345")
    assert text.startswith("کد ورود شما به دادرُز: 12345")
    assert text.splitlines()[-1] == "@dadrosebook.com #12345"


@pytest.mark.django_db
def test_message_uses_admin_text(settings):
    settings.SITE_HOST = "dadrosebook.com"
    SmsTemplate.objects.update_or_create(key=OTP_LOGIN, defaults={"body": "دادرُز\nکد: {code}"})
    assert otp_message("54321") == "دادرُز\nکد: 54321\n\n@dadrosebook.com #54321"


@pytest.mark.django_db
@pytest.mark.parametrize("body,active", [("بدون کد", True), ("کد: {code}", False)])
def test_broken_or_disabled_template_still_sends_code(settings, body, active):
    settings.SITE_HOST = "dadrosebook.com"
    SmsTemplate.objects.update_or_create(
        key=OTP_LOGIN, defaults={"body": body, "is_active": active}
    )
    assert otp_message("11111").startswith("کد ورود شما به دادرُز: 11111")


@pytest.mark.django_db
def test_no_host_means_no_line(settings):
    settings.SITE_HOST = ""
    settings.FRONTEND_URL = ""
    assert "@" not in otp_message("12345")
