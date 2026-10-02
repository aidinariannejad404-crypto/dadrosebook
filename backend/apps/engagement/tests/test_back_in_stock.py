from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import BookVariant
from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.engagement.models import BackInStockRequest
from apps.engagement.services import (
    BackInStockError,
    mark_converted,
    notify_variant_restocked,
    request_back_in_stock,
)

pytestmark = pytest.mark.django_db

URL = "/api/v1/back-in-stock/"
PENDING = BackInStockRequest.Status.PENDING
NOTIFIED = BackInStockRequest.Status.NOTIFIED


class FakeSms:
    sent: list[tuple[str, str]] = []

    def send(self, phone, message):
        FakeSms.sent.append((phone, message))


@pytest.fixture(autouse=True)
def fake_sms(settings):
    cache.clear()
    FakeSms.sent = []
    settings.SMS_PROVIDER = "apps.engagement.tests.test_back_in_stock.FakeSms"
    settings.SITE_URL = "https://shop.example/"
    yield FakeSms
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def variants(db):
    book = make_book("حقوق مدنی", variants=[print_variant(2_200_000, 0), ebook_variant(990_000)])
    stocked = make_book("آیین دادرسی", variants=[print_variant(500_000, 5)])
    hidden = make_book("غیرفعال", variants=[print_variant(500_000, 0)], is_active=False)
    return {
        "book": book,
        "print": book.variants.get(type=BookVariant.Type.PRINT),
        "ebook": book.variants.get(type=BookVariant.Type.EBOOK),
        "stocked": stocked.variants.get(),
        "hidden": hidden.variants.get(),
    }


# --- service ------------------------------------------------------------------------------------


def test_request_creates_then_is_idempotent(variants):
    obj, created = request_back_in_stock(variants["print"], "۰۹۱۲ ۱۲۳ ۴۵۶۷", source="product")
    assert created and obj.status == PENDING and obj.phone == "09121234567"
    assert obj.source == "product"
    again, created = request_back_in_stock(variants["print"], "+989121234567")
    assert not created and again.pk == obj.pk
    assert BackInStockRequest.objects.count() == 1


def test_request_links_authenticated_user(variants):
    user = User.objects.create_user(phone="09121234567")
    obj, _ = request_back_in_stock(variants["print"], "09121234567")
    assert obj.user is None
    obj, created = request_back_in_stock(variants["print"], "09121234567", user=user)
    assert not created and obj.user == user


def test_request_rules(variants):
    with pytest.raises(ValidationError):
        request_back_in_stock(variants["print"], "12345")
    for key, code in (("stocked", "in_stock"), ("ebook", "in_stock"), ("hidden", "unavailable")):
        with pytest.raises(BackInStockError) as exc:
            request_back_in_stock(variants[key], "09121234567")
        assert exc.value.code == code and exc.value.detail
    variants["print"].is_active = False
    variants["print"].save()
    with pytest.raises(BackInStockError) as exc:
        request_back_in_stock(variants["print"], "09121234567")
    assert exc.value.code == "unavailable"


def test_notify_requires_stock(variants, fake_sms):
    request_back_in_stock(variants["print"], "09121234567")
    assert notify_variant_restocked(variants["print"].pk) == 0
    assert fake_sms.sent == []


def test_restock_signal_sends_sms_and_marks_notified(
    variants, fake_sms, django_capture_on_commit_callbacks
):
    request_back_in_stock(variants["print"], "09121234567")
    request_back_in_stock(variants["print"], "09351234567")
    variant = variants["print"]
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        variant.stock = 4
        variant.save()
    assert len(callbacks) == 1
    assert sorted(phone for phone, _ in fake_sms.sent) == ["09121234567", "09351234567"]
    message = fake_sms.sent[0][1]
    assert "حقوق مدنی" in message
    assert f"https://shop.example/product/{variants['book'].slug}" in message
    assert set(BackInStockRequest.objects.values_list("status", flat=True)) == {NOTIFIED}
    assert not BackInStockRequest.objects.filter(notified_at__isnull=True).exists()

    # Already notified: another restock sends nothing.
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        variant.stock = 0
        variant.save()
        variant.stock = 3
        variant.save()
    assert callbacks == []
    assert len(fake_sms.sent) == 2


def test_no_task_without_pending_or_without_zero_to_positive(
    variants, django_capture_on_commit_callbacks
):
    variant = variants["print"]
    with django_capture_on_commit_callbacks() as callbacks:
        variant.stock = 2
        variant.save()  # no pending requests
    assert callbacks == []
    variant.stock = 0
    variant.save()
    request_back_in_stock(variant, "09121234567")
    with django_capture_on_commit_callbacks() as callbacks:
        variant.price = 2_300_000
        variant.save()  # still 0
    assert callbacks == []


def test_failed_sms_leaves_request_pending(variants, settings):
    settings.SMS_PROVIDER = "apps.engagement.tests.test_back_in_stock.BrokenSms"
    request_back_in_stock(variants["print"], "09121234567")
    BookVariant.objects.filter(pk=variants["print"].pk).update(stock=3)
    assert notify_variant_restocked(variants["print"].pk) == 0
    assert BackInStockRequest.objects.get().status == PENDING


class BrokenSms:
    def send(self, phone, message):
        raise RuntimeError("provider down")


def test_mark_converted(variants):
    user = User.objects.create_user(phone="09350000000")
    by_phone, _ = request_back_in_stock(variants["print"], "09121234567")
    by_user, _ = request_back_in_stock(variants["print"], "09130000000", user=user)
    old, _ = request_back_in_stock(variants["print"], "09140000000")
    now = timezone.now()
    BackInStockRequest.objects.update(status=NOTIFIED, notified_at=now)
    BackInStockRequest.objects.filter(pk=old.pk).update(notified_at=now - timedelta(days=31))

    assert mark_converted(variants["print"].pk, "۰۹۱۲۱۲۳۴۵۶۷") == 1
    assert mark_converted(variants["print"].pk, None, user) == 1
    assert mark_converted(variants["print"].pk, "09140000000") == 0
    assert mark_converted(variants["print"].pk) == 0
    converted = set(
        BackInStockRequest.objects.filter(converted_at__isnull=False).values_list("pk", flat=True)
    )
    assert converted == {by_phone.pk, by_user.pk}


# --- API ----------------------------------------------------------------------------------------


def test_api_create_then_existing(api, variants):
    body = {"variant_id": variants["print"].pk, "phone": "09121234567", "source": "card"}
    response = api.post(URL, body, format="json")
    assert response.status_code == 201
    data = response.json()
    assert set(data) == {"id", "status", "created", "message"}
    assert data["status"] == "PENDING" and data["created"] is True and data["message"]
    again = api.post(URL, body, format="json")
    assert again.status_code == 200
    assert again.json()["created"] is False and again.json()["id"] == data["id"]


def test_api_errors(api, variants):
    bad_phone = api.post(URL, {"variant_id": variants["print"].pk, "phone": "123"}, format="json")
    assert bad_phone.status_code == 400 and "phone" in bad_phone.json()
    in_stock = api.post(
        URL, {"variant_id": variants["ebook"].pk, "phone": "09121234567"}, format="json"
    )
    assert in_stock.status_code == 400 and in_stock.json()["code"] == "in_stock"
    hidden = api.post(
        URL, {"variant_id": variants["hidden"].pk, "phone": "09121234567"}, format="json"
    )
    assert hidden.status_code == 400 and hidden.json()["code"] == "unavailable"
    unknown = api.post(URL, {"variant_id": 999_999, "phone": "09121234567"}, format="json")
    assert unknown.status_code == 404


def test_api_throttled_after_ten_per_hour(api, variants):
    for i in range(10):
        body = {"variant_id": variants["print"].pk, "phone": f"0912000000{i}"}
        assert api.post(URL, body, format="json").status_code == 201
    body = {"variant_id": variants["print"].pk, "phone": "09129999999"}
    assert api.post(URL, body, format="json").status_code == 429


# --- admin --------------------------------------------------------------------------------------


@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


def test_admin_changelist_search_and_notify_action(admin_client, variants, fake_sms):
    obj, _ = request_back_in_stock(variants["print"], "09121234567")
    request_back_in_stock(variants["print"], "09351234567")
    page = admin_client.get("/admin/engagement/backinstockrequest/")
    assert page.status_code == 200
    assert "۲" in page.content.decode()  # pending count for the variant
    assert admin_client.get("/admin/engagement/backinstockrequest/?q=۰۹۱۲").status_code == 200
    assert admin_client.get("/admin/engagement/backinstockrequest/?q=مدنی").status_code == 200
    response = admin_client.post(
        "/admin/engagement/backinstockrequest/",
        {"action": "notify_now", "_selected_action": [obj.pk]},
    )
    assert response.status_code == 302
    obj.refresh_from_db()
    assert obj.status == NOTIFIED
    assert [phone for phone, _ in fake_sms.sent] == ["09121234567"]
