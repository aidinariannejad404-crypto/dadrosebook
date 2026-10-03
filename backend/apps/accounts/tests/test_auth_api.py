from unittest import mock

import pytest
from django.contrib.auth.signals import user_logged_in
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import tokens

PHONE = "09121234567"
REQUEST = "/api/v1/auth/otp/request/"
VERIFY = "/api/v1/auth/otp/verify/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/me/"

pytestmark = pytest.mark.django_db


def login(api, sent_codes, phone=PHONE):
    assert api.post(REQUEST, {"phone": phone}, format="json").status_code == 200
    return api.post(VERIFY, {"phone": phone, "code": sent_codes[PHONE][-1]}, format="json")


def test_request_ok(api, sent_codes):
    res = api.post(REQUEST, {"phone": "+۹۸۹۱۲۱۲۳۴۵۶۷"}, format="json")
    assert res.status_code == 200
    assert res.json() == {"phone": PHONE, "expires_in": 120, "resend_in": 60, "length": 5}


def test_request_invalid_phone(api):
    res = api.post(REQUEST, {"phone": "123"}, format="json")
    assert res.status_code == 400
    assert "phone" in res.json()


def test_request_resend_cooldown_429(api, sent_codes):
    api.post(REQUEST, {"phone": PHONE}, format="json")
    res = api.post(REQUEST, {"phone": PHONE}, format="json")
    assert res.status_code == 429
    body = res.json()
    assert body["detail"] and 0 < body["retry_after"] <= 60
    assert res["Retry-After"] == str(body["retry_after"])


def test_request_hourly_limit_429(api, sent_codes, settings):
    settings.OTP_RESEND_SECONDS = 0
    for _ in range(5):
        assert api.post(REQUEST, {"phone": PHONE}, format="json").status_code == 200
    res = api.post(REQUEST, {"phone": PHONE}, format="json")
    assert res.status_code == 429
    assert res.json()["retry_after"] > 60


def test_request_ip_throttle(api, sent_codes):
    rates = {"otp_request": "2/hour"}
    with mock.patch("rest_framework.throttling.ScopedRateThrottle.THROTTLE_RATES", rates):
        api.post(REQUEST, {"phone": "09120000001"}, format="json")
        api.post(REQUEST, {"phone": "09120000002"}, format="json")
        res = api.post(REQUEST, {"phone": "09120000003"}, format="json")
    assert res.status_code == 429
    assert res.json()["retry_after"] > 0


def test_verify_new_user_sets_cookies(api, sent_codes, settings):
    res = login(api, sent_codes)
    assert res.status_code == 200
    body = res.json()
    assert body["is_new"] is True
    assert body["user"]["phone"] == PHONE
    assert set(body["user"]) == {
        "id",
        "phone",
        "first_name",
        "last_name",
        "full_name",
        "is_staff",
        "date_joined",
    }
    access, refresh = res.cookies["dr_access"], res.cookies["dr_refresh"]
    assert access["httponly"] and refresh["httponly"]
    assert access["samesite"] == "Lax" and refresh["samesite"] == "Lax"
    assert access["path"] == "/"
    assert refresh["path"] == "/api/v1/auth/"
    assert int(access["max-age"]) == settings.JWT_ACCESS_LIFETIME_SECONDS
    assert int(refresh["max-age"]) == settings.JWT_REFRESH_LIFETIME_SECONDS
    # The cookie authenticates /me.
    me = api.get(ME)
    assert me.status_code == 200 and me.json()["phone"] == PHONE


def test_verify_existing_user_and_signal(api, sent_codes):
    existing = User.objects.create_user(PHONE)
    assert existing.last_login is None
    received = []

    def handler(sender, request, user, **kwargs):
        received.append((sender, request, user))

    user_logged_in.connect(handler)
    try:
        res = login(api, sent_codes)
    finally:
        user_logged_in.disconnect(handler)
    assert res.status_code == 200 and res.json()["is_new"] is False
    assert len(received) == 1
    sender, request, user = received[0]
    assert sender is User and user == existing and request is not None
    existing.refresh_from_db()
    assert existing.last_login is not None


def test_verify_wrong_code(api, sent_codes):
    api.post(REQUEST, {"phone": PHONE}, format="json")
    bad = "00000" if sent_codes[PHONE][0] != "00000" else "11111"
    res = api.post(VERIFY, {"phone": PHONE, "code": bad}, format="json")
    assert res.status_code == 400
    assert res.json() == {"code": ["کد واردشده درست نیست."]}
    assert "dr_access" not in res.cookies


def test_verify_persian_digits(api, sent_codes):
    api.post(REQUEST, {"phone": PHONE}, format="json")
    fa = sent_codes[PHONE][0].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    res = api.post(VERIFY, {"phone": "۰۹۱۲۱۲۳۴۵۶۷", "code": fa}, format="json")
    assert res.status_code == 200


def test_verify_inactive_user(api, sent_codes):
    User.objects.create_user(PHONE, is_active=False)
    api.post(REQUEST, {"phone": PHONE}, format="json")
    res = api.post(VERIFY, {"phone": PHONE, "code": sent_codes[PHONE][0]}, format="json")
    assert res.status_code == 400
    assert "detail" in res.json()
    assert "dr_access" not in res.cookies


def test_untrusted_origin_rejected(api, sent_codes, user):
    res = api.post(REQUEST, {"phone": PHONE}, format="json", HTTP_ORIGIN="https://evil.example")
    assert res.status_code == 403
    access, _ = tokens.issue_pair(user)
    api.cookies["dr_access"] = access
    res = api.patch(ME, {"first_name": "x"}, format="json", HTTP_ORIGIN="https://evil.example")
    assert res.status_code == 403
    ok = api.patch(ME, {"first_name": "x"}, format="json", HTTP_ORIGIN="http://localhost:3000")
    assert ok.status_code == 200


def test_me_anonymous_401(api):
    assert api.get(ME).status_code == 401
    assert api.patch(ME, {"first_name": "x"}, format="json").status_code == 401


def test_me_get_and_patch(auth_api, user):
    res = auth_api.get(ME)
    assert res.status_code == 200
    assert res.json()["full_name"] == "علی رضایی"
    res = auth_api.patch(
        ME, {"first_name": " مریم ", "last_name": "احمدی", "phone": "09129999999"}, format="json"
    )
    assert res.status_code == 200
    assert res.json()["full_name"] == "مریم احمدی"
    user.refresh_from_db()
    assert user.first_name == "مریم" and user.phone == PHONE


def test_me_inactive_user_401(auth_api, user):
    user.is_active = False
    user.save()
    assert auth_api.get(ME).status_code == 401


def test_refresh_rotates_and_old_token_rejected(user):
    api = APIClient()
    _, refresh = tokens.issue_pair(user)
    api.cookies["dr_refresh"] = refresh
    res = api.post(REFRESH)
    assert res.status_code == 200
    assert res.json()["user"]["phone"] == PHONE
    new_refresh = res.cookies["dr_refresh"].value
    assert new_refresh and new_refresh != refresh
    assert res.cookies["dr_access"].value

    replay = APIClient()
    replay.cookies["dr_refresh"] = refresh
    res = replay.post(REFRESH)
    assert res.status_code == 401
    assert res.cookies["dr_refresh"].value == ""
    assert res.cookies["dr_access"].value == ""

    again = APIClient()
    again.cookies["dr_refresh"] = new_refresh
    assert again.post(REFRESH).status_code == 200


def test_refresh_missing_or_invalid(api, user):
    assert api.post(REFRESH).status_code == 401
    api.cookies["dr_refresh"] = "garbage"
    assert api.post(REFRESH).status_code == 401
    access, _ = tokens.issue_pair(user)
    api.cookies["dr_refresh"] = access  # wrong token type
    assert api.post(REFRESH).status_code == 401


def test_refresh_inactive_user(user):
    api = APIClient()
    _, refresh = tokens.issue_pair(user)
    api.cookies["dr_refresh"] = refresh
    user.is_active = False
    user.save()
    assert api.post(REFRESH).status_code == 401


def test_logout_revokes_refresh(auth_api):
    refresh = auth_api.cookies["dr_refresh"].value
    res = auth_api.post(LOGOUT)
    assert res.status_code == 204
    assert res.cookies["dr_access"].value == ""
    assert res.cookies["dr_refresh"]["path"] == "/api/v1/auth/"
    with pytest.raises(tokens.TokenError):
        tokens.decode(refresh, "refresh")
    replay = APIClient()
    replay.cookies["dr_refresh"] = refresh
    assert replay.post(REFRESH).status_code == 401


def test_logout_anonymous(api):
    assert api.post(LOGOUT).status_code == 204
