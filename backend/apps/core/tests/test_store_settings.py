import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import StoreSettings
from apps.core.services.store_settings import get_store_settings, sanitize_enamad_html

pytestmark = pytest.mark.django_db

STORE_KEYS = {
    "free_shipping_threshold", "print_dispatch_note", "delivery_tehran_note",
    "delivery_province_note", "consult_whatsapp", "consult_telegram", "support_hours",
    "enamad_html", "students_count_claim",
}  # fmt: skip

ENAMAD = (
    "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=1&Code=x'>"
    "<img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=1&Code=x' alt=''"
    " style='cursor:pointer' onclick='alert(1)' code='x'></a><script>alert(1)</script>"
)


def test_sanitize_enamad_keeps_link_and_image_only():
    clean = sanitize_enamad_html(ENAMAD)
    assert "<script" not in clean and "onclick" not in clean and "style" not in clean
    assert 'href="https://trustseal.enamad.ir/?id=1&amp;Code=x"' in clean
    assert 'referrerpolicy="origin"' in clean and 'target="_blank"' in clean
    assert 'rel="noopener"' in clean and "noreferrer" not in clean
    assert 'src="https://trustseal.enamad.ir/logo.aspx?id=1&amp;Code=x"' in clean
    assert sanitize_enamad_html("<a href='javascript:alert(1)'>x</a>") == '<a rel="noopener">x</a>'
    assert sanitize_enamad_html("") == ""
    assert sanitize_enamad_html(None) == ""


def test_singleton():
    StoreSettings.objects.all().delete()
    first = get_store_settings()
    assert first.pk == 1
    assert first.print_dispatch_note == "ارسال حداکثر ۱ روز کاری پس از سفارش"
    assert first.delivery_tehran_note == "تحویل تهران ۱ تا ۲ روز کاری"
    assert first.delivery_province_note == "سایر شهرها ۳ تا ۵ روز کاری"
    other = StoreSettings(support_hours="۹ تا ۲۱", enamad_html=ENAMAD)
    other.save()
    assert StoreSettings.objects.count() == 1
    stored = get_store_settings()
    assert stored.support_hours == "۹ تا ۲۱" and "<script" not in stored.enamad_html
    stored.delete()
    assert StoreSettings.objects.count() == 1


def test_store_settings_endpoint():
    api = APIClient()
    data = api.get("/api/v1/store/settings/").json()
    assert set(data) == STORE_KEYS
    assert data["free_shipping_threshold"] is None  # 0 = no free shipping
    assert data["students_count_claim"] == "" and data["consult_whatsapp"] == ""
    settings_obj = get_store_settings()
    settings_obj.free_shipping_threshold = 1_500_000
    settings_obj.consult_whatsapp = "989121234567"
    settings_obj.save()
    data = api.get("/api/v1/store/settings/").json()
    assert data["free_shipping_threshold"] == 1_500_000
    assert data["consult_whatsapp"] == "989121234567"


def test_store_settings_admin_is_single_instance(client):
    from apps.accounts.models import User

    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    response = client.get(reverse("admin:core_storesettings_changelist"))
    assert response.status_code == 302
    assert response.url == reverse("admin:core_storesettings_change", args=[1])
    page = client.get(response.url)
    assert page.status_code == 200
    assert "حد ارسال رایگان" in page.content.decode()
    assert client.get(reverse("admin:core_storesettings_add")).status_code == 403
    assert client.get(reverse("admin:index")).content.decode().count("تنظیمات فروشگاه") >= 1
