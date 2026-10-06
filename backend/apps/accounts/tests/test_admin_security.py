import logging
import re

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.accounts.admin_security import client_ip, ip_allowed
from apps.accounts.models import OtpCode, User
from apps.accounts.services import staff_2fa

TWO_FA = "/admin/2fa/"
STAFF_PHONE = "09120000000"


@pytest.fixture
def staff_sms(monkeypatch):
    """Capture staff 2FA codes sent through the SMS provider: ``[code, …]``."""
    from apps.accounts.sms import ConsoleSmsProvider

    sent: list[tuple[str, str]] = []

    def fake_send(self, phone, message):
        sent.append((phone, re.search(r"\d{6}", message).group()))

    monkeypatch.setattr(ConsoleSmsProvider, "send", fake_send)
    return sent


@pytest.fixture
def staff(db):
    return User.objects.create_superuser(STAFF_PHONE, "pass")


@pytest.fixture
def staff_client(client, staff):
    client.force_login(staff)
    return client


def _to_fa(digits: str) -> str:
    return digits.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _wrong(code: str) -> str:
    return "".join(str((int(c) + 1) % 10) for c in code)


# --- 2FA gate ------------------------------------------------------------------------------------


@override_settings(STAFF_2FA_REQUIRED=True)
def test_staff_redirected_to_2fa_when_required(staff_client):
    res = staff_client.get("/admin/accounts/user/?q=1")
    assert res.status_code == 302
    assert res["Location"] == f"{TWO_FA}?next=%2Fadmin%2Faccounts%2Fuser%2F%3Fq%3D1"
    # The custom admin view under /admin/ is covered too.
    assert staff_client.get(reverse("backoffice-sales-report")).status_code == 302


@override_settings(STAFF_2FA_REQUIRED=False)
def test_no_redirect_when_disabled(staff_client):
    assert staff_client.get("/admin/").status_code == 200


@override_settings(STAFF_2FA_REQUIRED=True)
def test_exempt_urls_stay_reachable(staff_client, staff_sms):
    assert staff_client.get(reverse("admin:jsi18n")).status_code == 200
    assert staff_client.get(TWO_FA).status_code == 200
    res = staff_client.post(reverse("admin:logout"))
    assert res.status_code == 200  # logged-out page, not a 2FA redirect


@override_settings(STAFF_2FA_REQUIRED=True)
def test_non_staff_unaffected(client, db, staff_sms):
    user = User.objects.create_user("09121112233", password="pass")
    client.force_login(user)
    res = client.get("/admin/")
    assert res.status_code == 302
    assert res["Location"].startswith(reverse("admin:login"))
    # The 2FA page itself sends nobody a code and logs nobody in.
    res = client.get(TWO_FA)
    assert res["Location"].startswith(reverse("admin:login"))
    assert staff_sms == []


@override_settings(STAFF_2FA_REQUIRED=True)
def test_anonymous_goes_to_login(client, db):
    res = client.get("/admin/")
    assert res["Location"].startswith(reverse("admin:login"))


# --- 2FA page ------------------------------------------------------------------------------------


@override_settings(STAFF_2FA_REQUIRED=True)
def test_page_sends_code_and_renders(staff_client, staff_sms):
    res = staff_client.get(TWO_FA)
    assert res.status_code == 200
    html = res.content.decode()
    assert 'autocomplete="one-time-code"' in html
    assert 'inputmode="numeric"' in html
    assert "ارسال دوباره" in html
    assert len(staff_sms) == 1 and staff_sms[0][0] == STAFF_PHONE
    # Reloading the page does not text another code while one is active.
    staff_client.get(TWO_FA)
    assert len(staff_sms) == 1
    # Separate from the customer OTP flow.
    assert not OtpCode.objects.exists()


@override_settings(STAFF_2FA_REQUIRED=True)
def test_verify_sets_flag_rotates_session_and_redirects(staff_client, staff, staff_sms, caplog):
    staff_client.get(TWO_FA)
    code = staff_sms[0][1]
    old_key = staff_client.session.session_key
    with caplog.at_level(logging.INFO, logger="apps.accounts.staff_2fa"):
        res = staff_client.post(TWO_FA, {"code": code, "next": "/admin/accounts/user/"})
    assert res.status_code == 302
    assert res["Location"] == "/admin/accounts/user/"
    session = staff_client.session
    assert session.session_key != old_key
    assert session[staff_2fa.SESSION_FLAG] == str(staff.pk)
    assert staff_client.get("/admin/").status_code == 200
    assert "Staff 2FA succeeded" in caplog.text
    assert code not in caplog.text


@override_settings(STAFF_2FA_REQUIRED=True)
def test_persian_digits_accepted(staff_client, staff_sms):
    staff_client.get(TWO_FA)
    res = staff_client.post(TWO_FA, {"code": f" {_to_fa(staff_sms[0][1])} "})
    assert res.status_code == 302
    assert res["Location"] == reverse("admin:index")


@pytest.mark.parametrize(
    "next_url", ["https://evil.example/", "//evil.example/admin/", "javascript:alert(1)"]
)
@override_settings(STAFF_2FA_REQUIRED=True)
def test_open_redirect_rejected(staff_client, staff_sms, next_url):
    staff_client.get(TWO_FA)
    res = staff_client.post(TWO_FA, {"code": staff_sms[0][1], "next": next_url})
    assert res.status_code == 302
    assert res["Location"] == reverse("admin:index")


@override_settings(STAFF_2FA_REQUIRED=True)
def test_wrong_code_limit_burns_code(staff_client, staff_sms, caplog):
    staff_client.get(TWO_FA)
    code = staff_sms[0][1]
    with caplog.at_level(logging.WARNING, logger="apps.accounts.staff_2fa"):
        for _ in range(4):
            res = staff_client.post(TWO_FA, {"code": _wrong(code)})
            assert res.status_code == 200
            assert staff_2fa.MSG_WRONG in res.content.decode()
        res = staff_client.post(TWO_FA, {"code": _wrong(code)})
    assert staff_2fa.MSG_BURNED in res.content.decode()
    assert caplog.text.count("Staff 2FA failed") == 5
    assert code not in caplog.text and _wrong(code) not in caplog.text
    # Even the right code no longer works: a new one is required.
    res = staff_client.post(TWO_FA, {"code": code})
    assert res.status_code == 200
    assert staff_2fa.MSG_BURNED in res.content.decode()
    assert staff_2fa.SESSION_FLAG not in staff_client.session


@override_settings(STAFF_2FA_REQUIRED=True)
def test_resend_throttled(staff_client, staff, staff_sms):
    staff_client.get(TWO_FA)
    assert len(staff_sms) == 1
    res = staff_client.post(TWO_FA, {"action": "resend"}, follow=True)
    assert len(staff_sms) == 1
    assert "ثانیه صبر کنید" in res.content.decode()

    # After the cooldown a resend issues a new code and the old one stops working.
    from django.core.cache import cache

    cache.delete(staff_2fa.COOLDOWN_KEY.format(user_id=staff.pk))
    res = staff_client.post(TWO_FA, {"action": "resend"}, follow=True)
    assert len(staff_sms) == 2
    assert "کد جدید پیامک شد" in res.content.decode()
    old, new = staff_sms[0][1], staff_sms[1][1]
    if old != new:
        assert staff_client.post(TWO_FA, {"code": old}).status_code == 200
    assert staff_client.post(TWO_FA, {"code": new}).status_code == 302


def test_code_expires(staff, staff_sms):
    staff_2fa.send_code(staff)
    code = staff_sms[0][1]
    entry_key = staff_2fa.CODE_KEY.format(user_id=staff.pk)
    from django.core.cache import cache

    entry = cache.get(entry_key)
    entry["expires_at"] -= 10 * 60
    cache.set(entry_key, entry)
    with pytest.raises(staff_2fa.Staff2faError) as exc:
        staff_2fa.verify_code(staff, code)
    assert exc.value.message == staff_2fa.MSG_NO_CODE


# --- IP allowlist --------------------------------------------------------------------------------


@override_settings(ADMIN_ALLOWED_IPS=["10.0.0.5"])
def test_allowlist_allows_listed_ip(staff_client):
    assert staff_client.get("/admin/", REMOTE_ADDR="10.0.0.5").status_code == 200


@override_settings(ADMIN_ALLOWED_IPS=["10.0.0.5"])
def test_allowlist_denies_other_ip(staff_client):
    assert staff_client.get("/admin/", REMOTE_ADDR="10.0.0.6").status_code == 404
    assert staff_client.get("/admin/login/", REMOTE_ADDR="10.0.0.6").status_code == 404
    assert staff_client.get(TWO_FA, REMOTE_ADDR="10.0.0.6").status_code == 404
    # Only the admin is restricted.
    assert staff_client.get("/api/v1/health/", REMOTE_ADDR="10.0.0.6").status_code == 200


@override_settings(ADMIN_ALLOWED_IPS=["192.168.1.0/24", "2001:db8::/32"])
def test_allowlist_cidr(staff_client):
    assert staff_client.get("/admin/", REMOTE_ADDR="192.168.1.77").status_code == 200
    assert staff_client.get("/admin/", REMOTE_ADDR="2001:db8::1").status_code == 200
    assert staff_client.get("/admin/", REMOTE_ADDR="192.168.2.1").status_code == 404


@override_settings(ADMIN_ALLOWED_IPS=["10.0.0.5"], REST_FRAMEWORK={"NUM_PROXIES": 0})
def test_proxy_header_ignored_without_proxies(staff_client):
    res = staff_client.get("/admin/", REMOTE_ADDR="10.0.0.6", HTTP_X_FORWARDED_FOR="10.0.0.5")
    assert res.status_code == 404


@override_settings(ADMIN_ALLOWED_IPS=["10.0.0.5"], REST_FRAMEWORK={"NUM_PROXIES": 1})
def test_proxy_header_used_with_proxies(staff_client):
    res = staff_client.get(
        "/admin/", REMOTE_ADDR="172.18.0.2", HTTP_X_FORWARDED_FOR="1.2.3.4, 10.0.0.5"
    )
    assert res.status_code == 200
    res = staff_client.get(
        "/admin/", REMOTE_ADDR="172.18.0.2", HTTP_X_FORWARDED_FOR="10.0.0.5, 9.9.9.9"
    )
    assert res.status_code == 404


def test_client_ip_ignores_xff_when_num_proxies_unset(rf):
    req = rf.get("/admin/", REMOTE_ADDR="10.0.0.6", HTTP_X_FORWARDED_FOR="10.0.0.5")
    assert client_ip(req) == "10.0.0.6"


@override_settings(ADMIN_ALLOWED_IPS=[])
def test_ip_allowed_empty_list_allows_all():
    assert ip_allowed("8.8.8.8")


@override_settings(ADMIN_ALLOWED_IPS=["not-an-ip", "10.0.0.0/8"])
def test_ip_allowed_skips_bad_entries():
    assert ip_allowed("10.1.2.3")
    assert not ip_allowed("garbage")
