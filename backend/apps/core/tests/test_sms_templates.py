import pytest
from django.test import Client

from apps.accounts.models import User
from apps.core.models import SmsTemplate
from apps.core.services.sms_templates import render_sms, unknown_placeholders
from apps.core.sms_catalog import KINDS, ORDER_PAID, ORDER_SHIPPED


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass12345")
    client = Client()
    client.force_login(admin)
    return client


def test_seeded_with_defaults(db):
    assert set(SmsTemplate.objects.values_list("key", flat=True)) == set(KINDS)
    assert render_sms(ORDER_PAID, order="DR1", total="۱ تومان") == (
        "سفارش DR1 با موفقیت پرداخت شد.\nدادرُز"
    )


def test_edited_text_and_switch_off(db):
    SmsTemplate.objects.filter(key=ORDER_SHIPPED).update(body="{order} رفت؛ رهگیری {tracking}")
    assert render_sms(ORDER_SHIPPED, order="DR1", tracking="99") == "DR1 رفت؛ رهگیری 99"
    SmsTemplate.objects.filter(key=ORDER_SHIPPED).update(is_active=False)
    assert render_sms(ORDER_SHIPPED, order="DR1", tracking="99") is None


def test_missing_row_uses_default_and_broken_falls_back(db):
    SmsTemplate.objects.filter(key=ORDER_PAID).delete()
    assert "DR2" in render_sms(ORDER_PAID, order="DR2")
    SmsTemplate.objects.create(key=ORDER_PAID, body="سفارش {order")
    assert render_sms(ORDER_PAID, order="DR3") == KINDS[ORDER_PAID].default.format(
        order="DR3", total=""
    )


def test_unknown_placeholders():
    assert unknown_placeholders(ORDER_PAID, "{order} {foo}") == {"foo"}
    with pytest.raises(ValueError):
        unknown_placeholders(ORDER_PAID, "{order")


def test_admin_edit_validates(admin_client):
    row = SmsTemplate.objects.get(key=ORDER_PAID)
    url = f"/admin/core/smstemplate/{row.pk}/change/"
    page = admin_client.get(url).content.decode()
    assert "پیش‌نمایش" in page and "{order}" in page
    res = admin_client.post(url, {"body": "سفارش {nope}", "is_active": "on"})
    assert "nope" in res.content.decode()
    row.refresh_from_db()
    assert "{nope}" not in row.body
    admin_client.post(url, {"body": "پرداخت {order} انجام شد", "is_active": "on"})
    row.refresh_from_db()
    assert row.body == "پرداخت {order} انجام شد"
    assert admin_client.get("/admin/core/smstemplate/").status_code == 200
