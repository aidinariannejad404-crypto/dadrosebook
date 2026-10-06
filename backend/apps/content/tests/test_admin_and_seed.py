from urllib.parse import quote

import pytest
from django.core.management import call_command
from django.urls import reverse

from apps.accounts.models import User
from apps.catalog.models import ExamType
from apps.content.models import CuratedList, Guide

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


@pytest.mark.parametrize("name", ["content_guide", "content_curatedlist"])
def test_changelist_and_add(admin_client, hub_world, name):
    assert admin_client.get(reverse(f"admin:{name}_changelist")).status_code == 200
    assert admin_client.get(reverse(f"admin:{name}_add")).status_code == 200


def test_guide_admin_shows_preview_link_and_accepts_jalali(admin_client, hub_world):
    response = admin_client.post(
        reverse("admin:content_guide_add"),
        {
            "title": "راهنمای تست",
            "slug": "",
            "status": "DRAFT",
            "summary": "",
            "intro": "",
            "body": "<p>متن</p>",
            "updated_on": "۱۴۰۵/۰۷/۱۰",
        },
    )
    assert response.status_code == 302, response.content.decode()[:2000]
    guide = Guide.objects.get(title="راهنمای تست")
    assert guide.updated_on.isoformat() == "2026-10-02"
    page = admin_client.get(reverse("admin:content_guide_change", args=[guide.pk])).content
    assert f"?preview={guide.preview_key}".encode() in page


def test_hub_status_in_catalog_admin(admin_client, hub_world):
    html = admin_client.get(
        reverse("admin:catalog_subject_change", args=[hub_world["civil"].pk])
    ).content.decode()
    assert "وضعیت ایندکس صفحه" in html
    assert "noindex" in html
    html = admin_client.get(
        reverse("admin:catalog_examtype_change", args=[hub_world["exam"].pk])
    ).content.decode()
    assert "قابل ایندکس" in html
    assert admin_client.get(reverse("admin:catalog_person_changelist")).status_code == 200
    page = admin_client.get(reverse("admin:catalog_publisher_changelist") + "?q=" + quote("مجد"))
    assert page.status_code == 200


def test_seed_hubs_is_idempotent_and_keeps_edits(db):
    exam = ExamType.objects.create(name="کانون وکلا")
    edited = ExamType.objects.create(name="قضاوت", intro="<p>متن آکادمی</p>")
    call_command("seed_hubs")
    exam.refresh_from_db()
    edited.refresh_from_db()
    assert exam.intro_is_placeholder is True
    assert len(exam.intro) > 500
    assert edited.intro == "<p>متن آکادمی</p>" and not edited.intro_is_placeholder
    guide = Guide.objects.get()
    assert guide.status == Guide.Status.DRAFT
    call_command("seed_hubs")
    assert Guide.objects.count() == 1 and CuratedList.objects.count() == 1
