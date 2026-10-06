"""ه۸ «گزارش مشکل» and ه۶ «شرح این ماده» links."""

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.accounts.models import User
from apps.catalog.models import Book
from apps.reader.models import ProblemReport, StatuteLink
from apps.reader.services import problems
from apps.reader.services.epub import process_epub

pytestmark = pytest.mark.django_db

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def report_url(book):
    return f"/api/v1/library/{book.slug}/problems/"


# ---------- problem reports ----------


def test_report_api_stores_context(owner_api, book, epub_ebook):
    res = owner_api.post(
        report_url(book),
        {
            "kind": "typo",
            "description": "ماده ۱۹ دو بار آمده",
            "page": 3,
            "location": "epub:1:20",
            "chapter_title": "فصل اول",
        },
        format="json",
        HTTP_USER_AGENT=UA,
    )
    assert res.status_code == 201, res.json()
    report = ProblemReport.objects.get()
    assert report.ebook_version == 1 and report.ebook_format == "EPUB"
    assert report.device_label == "Chrome · Android"
    assert report.status == ProblemReport.Status.NEW
    assert res.json()["status"] == "new"


def test_report_validation_and_auth(owner_api, book, epub_ebook):
    from rest_framework.test import APIClient

    anonymous = APIClient()
    assert anonymous.post(report_url(book), {"kind": "typo"}, format="json").status_code == 401
    assert owner_api.post(report_url(book), {"kind": "bogus"}, format="json").status_code == 400
    res = owner_api.post(report_url(book), {"kind": "other"}, format="json")
    assert res.status_code == 400 and "description" in res.json()
    assert owner_api.post(report_url(book), {"kind": "display"}, format="json").status_code == 201


def test_report_is_rate_limited(owner_api, book, epub_ebook, settings):
    settings.READER_PROBLEM_RATE = "2/day"
    for _ in range(2):
        assert (
            owner_api.post(report_url(book), {"kind": "display"}, format="json").status_code == 201
        )
    assert owner_api.post(report_url(book), {"kind": "display"}, format="json").status_code == 429


def test_open_count_badge_and_status(reader, book):
    problems.create_report(reader, book, kind="typo")
    done = problems.create_report(reader, book, kind="display")
    problems.set_status(ProblemReport.objects.filter(pk=done.pk), ProblemReport.Status.RESOLVED)
    done.refresh_from_db()
    assert done.resolved_at is not None
    assert problems.open_reports() == 1
    assert problems.problem_reports_badge(None) == "۱"


def test_admin_list_and_work_queue(client, reader, book):
    from apps.backoffice.services import work_queue

    admin = User.objects.create_superuser(phone="09120000000", password="pass")
    client.force_login(admin)
    report = problems.create_report(reader, book, kind="missing_page", page=12)
    url = reverse("admin:reader_problemreport_changelist")
    res = client.get(url + "?status__in=new,in_progress")
    assert res.status_code == 200 and "صفحه یا بخش ناقص" in res.content.decode()
    assert (
        client.get(reverse("admin:reader_problemreport_change", args=[report.pk])).status_code
        == 200
    )
    item = {i["key"]: i for i in work_queue.work_items()}["reader_problems"]
    assert item["count"] == 1 and item["url"].startswith(url)
    res = client.post(
        url,
        {"action": "mark_resolved", "_selected_action": [report.pk]},
    )
    assert res.status_code == 302
    report.refresh_from_db()
    assert report.status == ProblemReport.Status.RESOLVED


# ---------- statute links ----------


def test_chapter_payload_carries_statute_links(owner_api, book, epub_ebook):
    process_epub(epub_ebook)
    target = Book.objects.create(title="شرح قانون مدنی")
    StatuteLink.objects.create(
        book=book, chapter_index=2, anchor="m10", label="ماده ۱۰", target_book=target
    )
    StatuteLink.objects.create(
        book=book, chapter_index=2, label="خاموش", target_book=target, is_active=False
    )
    url = f"/api/v1/library/{book.slug}/epub/chapters/2/"
    data = owner_api.get(url, HTTP_X_READER_DEVICE="device-0001").json()
    assert data["statute_links"] == [
        {
            "id": StatuteLink.objects.get(label="ماده ۱۰").id,
            "anchor": "m10",
            "label": "ماده ۱۰",
            "book": {"slug": target.slug, "title": target.title, "authors": []},
        }
    ]
    other = owner_api.get(url.replace("/2/", "/1/"), HTTP_X_READER_DEVICE="device-0001").json()
    assert other["statute_links"] == []


def test_seed_demo_statute(db):
    from django.core.management import call_command

    from apps.library.models import EbookFile

    Book.objects.create(title="شرح قانون مدنی")
    call_command("seed_demo_ebooks", "--statute")
    call_command("seed_demo_ebooks", "--statute")  # idempotent
    book = Book.objects.get(title="قانون مدنی (نسخه نمایشی)")
    assert book.is_free_ebook
    ebook = EbookFile.objects.get(book=book, is_active=True)
    assert ebook.epub_package.chapters.count() == 4
    assert "متن نمایشی" in ebook.epub_package.chapters.get(index=0).text
    assert StatuteLink.objects.filter(book=book).count() == 3
    for e in EbookFile.objects.filter(book=book):
        e.file.delete(save=False)
