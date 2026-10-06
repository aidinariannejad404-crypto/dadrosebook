import datetime as dt

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.sms import deliver_sms
from apps.accounts.tasks import send_sms
from apps.core.sms_catalog import ABANDONED_CART, BACK_IN_STOCK, ORDER_PAID
from apps.inbox.models import Notification
from apps.inbox.services import notifications as n
from apps.orders.models import DiscountCode

from .conftest import client_for


def test_store_sms_is_copied_to_the_inbox(user, sent):
    send_sms.delay(user.phone, "سفارش DR1 پرداخت شد.", kind=ORDER_PAID, link="/account/orders/DR1")
    assert sent == [(user.phone, "سفارش DR1 پرداخت شد.")]
    item = Notification.objects.get(user=user)
    assert item.kind == ORDER_PAID
    assert item.title == "پرداخت موفق سفارش"
    assert item.link == "/account/orders/DR1"
    assert item.read_at is None


def test_guest_phone_and_plain_sms_get_no_inbox_item(user, sent):
    deliver_sms("09350000000", "موجود شد", kind=BACK_IN_STOCK)
    deliver_sms(user.phone, "کد ورود به پنل: 123456")  # staff 2FA: no kind
    assert len(sent) == 2
    assert not Notification.objects.exists()


def test_muted_marketing_kind_skips_sms_and_inbox(user, sent):
    n.set_preferences(user, {ABANDONED_CART: False})
    assert deliver_sms(user.phone, "سبد شما منتظر است", kind=ABANDONED_CART) is False
    assert sent == []
    assert not Notification.objects.exists()
    # service messages always go out
    assert deliver_sms(user.phone, "پرداخت شد", kind=ORDER_PAID) is True
    assert len(sent) == 1


def test_service_kinds_cannot_be_muted(user):
    with pytest.raises(n.PreferenceError):
        n.set_preferences(user, {ORDER_PAID: False})
    with pytest.raises(n.PreferenceError):
        n.set_preferences(user, {"nope": False})
    n.set_preferences(user, {ORDER_PAID: True})  # a no-op, not an error


def test_preferences_list_marketing_first(user):
    rows = n.set_preferences(user, {ABANDONED_CART: False})
    assert rows[0]["marketing"] is True
    by_kind = {r["kind"]: r for r in rows}
    assert by_kind[ABANDONED_CART]["enabled"] is False
    assert by_kind[ORDER_PAID] == {
        "kind": ORDER_PAID,
        "label": "پرداخت موفق سفارش",
        "marketing": False,
        "enabled": True,
        "locked": True,
    }
    n.set_preferences(user, {ABANDONED_CART: True})
    assert n.muted_kinds(user) == set()


def test_clean_link(settings):
    settings.SITE_URL = "https://dadrosebook.com"
    assert n.clean_link("https://dadrosebook.com/cart") == "/cart"
    assert n.clean_link("/product/x") == "/product/x"
    assert n.clean_link("//evil.com") == ""
    assert n.clean_link("https://evil.com/x") == ""
    assert n.clean_link("") == ""


def test_hook_failure_does_not_block_sms(user, sent, settings):
    settings.SMS_DELIVERY_HOOKS = ["apps.does_not_exist.hook"]
    assert deliver_sms(user.phone, "x", kind=ORDER_PAID) is True
    assert len(sent) == 1


def test_unread_and_mark_read(user):
    a = n.notify(user, n.ANNOUNCEMENT, "اول")
    n.notify(user, n.ANNOUNCEMENT, "دوم")
    assert n.unread_count(user) == 2
    assert n.mark_read(user, [a.pk]) == 1
    assert n.unread_count(user) == 1
    assert n.mark_read(user) == 1
    assert n.unread_count(user) == 0


def test_personal_codes(user):
    now = timezone.now()
    DiscountCode.objects.create(code="SPRING", value=10, valid_until=now + dt.timedelta(days=5))
    DiscountCode.objects.create(code="OLD", value=10, valid_until=now - dt.timedelta(days=1))
    n.notify(user, n.DISCOUNT_CODE, "کد بهار", code="spring")
    n.notify(user, n.DISCOUNT_CODE, "دوباره", code="SPRING")
    n.notify(user, n.DISCOUNT_CODE, "قدیمی", code="OLD")
    n.notify(user, n.ANNOUNCEMENT, "بدون کد")
    rows = {r["code"].upper(): r for r in n.personal_codes(user, now=now)}
    assert set(rows) == {"SPRING", "OLD"}
    assert rows["SPRING"]["is_valid"] is True
    assert rows["OLD"]["is_valid"] is False


def test_muted_kind_notify_returns_none(user):
    n.set_preferences(user, {n.DISCOUNT_CODE: False})
    assert n.notify(user, n.DISCOUNT_CODE, "x", code="A") is None


# --- API ---


def test_inbox_api(user, auth_api):
    n.notify(user, n.ANNOUNCEMENT, "سلام", link="/changelog")
    other = User.objects.create_user("09129999999")
    n.notify(other, n.ANNOUNCEMENT, "مال دیگری")
    res = auth_api.get("/api/v1/inbox/")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["results"][0]["body"] == "سلام" and body["results"][0]["is_read"] is False
    res = auth_api.post("/api/v1/inbox/read/", {}, format="json")
    assert res.json() == {"marked": 1, "unread": 0}
    assert client_for(other).get("/api/v1/inbox/").json()["results"][0]["is_read"] is False


def test_inbox_requires_login(api):
    assert api.get("/api/v1/inbox/").status_code == 401
    assert api.get("/api/v1/inbox/summary/").status_code == 401
    assert api.get("/api/v1/me/notification-settings/").status_code == 401


def test_notification_settings_api(auth_api):
    rows = auth_api.get("/api/v1/me/notification-settings/").json()
    assert any(r["kind"] == ABANDONED_CART and r["enabled"] for r in rows)
    res = auth_api.patch(
        "/api/v1/me/notification-settings/", {"changes": {ABANDONED_CART: False}}, format="json"
    )
    assert res.status_code == 200
    assert {r["kind"]: r["enabled"] for r in res.json()}[ABANDONED_CART] is False
    res = auth_api.patch(
        "/api/v1/me/notification-settings/", {"changes": {ORDER_PAID: False}}, format="json"
    )
    assert res.status_code == 400


def test_codes_api(user, auth_api):
    n.notify(user, n.DISCOUNT_CODE, "کد", code="X1")
    res = auth_api.get("/api/v1/inbox/codes/")
    assert res.status_code == 200
    assert res.json()[0]["code"] == "X1" and res.json()[0]["is_valid"] is False
