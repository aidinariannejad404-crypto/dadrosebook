"""Phase 6b: total copy quota, notebook export, offline licenses."""

import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone

from apps.reader.models import Bookmark, Highlight, OfflineLicense, ReaderAccessLog
from apps.reader.services import quota
from apps.reader.services.epub import process_epub


def dev(n: int) -> dict:
    return {"HTTP_X_READER_DEVICE": f"bbbbbbbb-2222-4222-8222-00000000000{n}"}


DEV = dev(1)


def url(name, book=None, **kwargs):
    if book is not None:
        kwargs["slug"] = book.slug
    return reverse(f"reader:{name}", kwargs=kwargs)


@pytest.fixture(autouse=True)
def loose_throttles(settings):
    for name in ("COPY", "EXPORT", "OFFLINE", "CHAPTER", "SEARCH"):
        setattr(settings, f"READER_{name}_RATE", "1000/min")
    cache.clear()


@pytest.mark.django_db
class TestCopyQuota:
    def test_epub_limit_is_ten_percent_with_minimum(self, epub_ebook, settings):
        package = process_epub(epub_ebook)
        settings.READER_COPY_QUOTA_MIN = 10
        assert quota.quota_limit(epub_ebook.book) == package.total_chars // 10
        settings.READER_COPY_QUOTA_MIN = 2000
        assert quota.quota_limit(epub_ebook.book) == 2000

    def test_pdf_limit_is_fixed(self, ebook, settings):
        settings.READER_PDF_COPY_QUOTA = 5000
        assert quota.quota_limit(ebook.book) == 5000

    def test_session_and_record(self, owner_api, ebook, settings):
        settings.READER_PDF_COPY_QUOTA = 1000
        data = owner_api.get(url("read", ebook.book), **DEV).json()
        assert data["copy_quota"] == {"limit": 1000, "used": 0}
        res = owner_api.post(url("copies", ebook.book), {"chars": 700}, format="json")
        assert res.json() == {"limit": 1000, "used": 700, "granted": 700}
        res = owner_api.post(url("copies", ebook.book), {"chars": 700}, format="json")
        assert res.json() == {"limit": 1000, "used": 1000, "granted": 300}
        res = owner_api.post(url("copies", ebook.book), {"chars": 5}, format="json")
        assert res.json()["granted"] == 0
        assert owner_api.get(url("read", ebook.book), **DEV).json()["copy_quota"]["used"] == 1000

    def test_quota_is_per_user(self, owner_api, api, stranger, grant, ebook):
        owner_api.post(url("copies", ebook.book), {"chars": 50}, format="json")
        grant(stranger, ebook.book)
        api.force_authenticate(stranger)
        assert api.get(url("read", ebook.book), **DEV).json()["copy_quota"]["used"] == 0

    def test_validation_and_access(self, owner_api, api, stranger, ebook):
        assert (
            owner_api.post(url("copies", ebook.book), {"chars": -1}, format="json").status_code
            == 400
        )
        api.force_authenticate(stranger)
        assert api.post(url("copies", ebook.book), {"chars": 1}, format="json").status_code == 403


@pytest.mark.django_db
class TestExport:
    def make_notes(self, reader, book, location=""):
        Highlight.objects.create(
            user=reader,
            book=book,
            page=2,
            text="مال بر دو قسم است " * 40,
            note="مهم برای آزمون",
            color="green",
            location=location,
        )
        Bookmark.objects.create(user=reader, book=book, page=3, label="ماده ۱۰")

    def test_markdown_for_pdf(self, owner_api, ebook, reader):
        self.make_notes(reader, ebook.book)
        res = owner_api.get(url("notes-export", ebook.book), {"format": "md"})
        assert res.status_code == 200
        assert res["Content-Type"].startswith("text/markdown")
        assert "attachment" in res["Content-Disposition"]
        assert "filename*=UTF-8''" in res["Content-Disposition"]
        body = res.content.decode()
        assert "# یادداشت‌های «حقوق مدنی ۱»" in body
        assert "## صفحه ۲" in body and "## صفحه ۳" in body
        assert "**یادداشت:** مهم برای آزمون" in body
        assert "هایلایت سبز" in body
        assert "نشانک · صفحه ۳ — ماده ۱۰" in body
        quote_line = next(line for line in body.splitlines() if line.startswith("> مال"))
        assert len(quote_line) <= 2 + 300 + 1  # "> " + cut quote + "…"
        assert ReaderAccessLog.objects.filter(kind="export", detail="md").exists()

    def test_epub_groups_by_chapter(self, owner_api, epub_ebook, reader):
        process_epub(epub_ebook)
        self.make_notes(reader, epub_ebook.book, location="epub:1:0-20")
        body = owner_api.get(
            url("notes-export", epub_ebook.book), {"format": "md"}
        ).content.decode()
        assert "## فصل اول: اموال" in body

    def test_quotes_capped_by_quota(self, owner_api, ebook, reader, settings):
        settings.READER_PDF_COPY_QUOTA = 100
        for _ in range(3):
            Highlight.objects.create(user=reader, book=ebook.book, page=1, text="ب" * 80)
        body = owner_api.get(url("notes-export", ebook.book)).content.decode()
        quoted = [line[2:] for line in body.splitlines() if line.startswith("> ب")]
        assert sum(q.count("ب") for q in quoted) == 100
        assert "سقف سهمیه کپی" in body

    def test_html_is_escaped_and_locked_down(self, owner_api, ebook, reader):
        Highlight.objects.create(
            user=reader,
            book=ebook.book,
            page=1,
            text="<script>alert(1)</script>",
            note="<img src=x onerror=alert(1)>",
        )
        res = owner_api.get(url("notes-export", ebook.book), {"format": "html"})
        body = res.content.decode()
        assert res["Content-Type"].startswith("text/html")
        assert "<script>" not in body and "<img" not in body
        assert "&lt;script&gt;" in body
        assert "default-src 'none'" in res["Content-Security-Policy"]
        assert 'dir="rtl"' in body

    def test_empty_notebook(self, owner_api, ebook):
        body = owner_api.get(url("notes-export", ebook.book)).content.decode()
        assert "هنوز هایلایت" in body

    def test_bad_format_and_access(self, owner_api, api, stranger, ebook):
        assert owner_api.get(url("notes-export", ebook.book), {"format": "pdf"}).status_code == 400
        api.force_authenticate(stranger)
        assert api.get(url("notes-export", ebook.book)).status_code == 403


@pytest.mark.django_db
class TestOffline:
    def test_session_offers_offline_for_epub_only(self, owner_api, epub_ebook, ebook):
        info = owner_api.get(url("read", epub_ebook.book), **DEV).json()["offline"]
        assert info == {"max_books": 3, "days": 14, "license": None}

    def test_pdf_has_no_offline(self, owner_api, ebook):
        assert owner_api.get(url("read", ebook.book), **DEV).json()["offline"] is None
        res = owner_api.post(url("offline", ebook.book), **DEV)
        assert res.status_code == 404 and res.json()["code"] == "offline_disabled"

    def test_issue_package_with_inlined_images(self, owner_api, epub_ebook):
        res = owner_api.post(url("offline", epub_ebook.book), **DEV)
        assert res.status_code == 201
        data = res.json()
        package = data["package"]
        assert len(package["chapters"]) == 3
        assert 'src="data:image/png;base64,' in package["chapters"][0]["html"]
        assert "/__asset__/" not in package["chapters"][0]["html"]
        assert package["epub"]["total_pages"] >= 3
        assert package["watermark"].startswith("0912***4567")
        assert data["license"]["book"] == epub_ebook.book.slug
        session = owner_api.get(url("read", epub_ebook.book), **DEV).json()
        assert session["offline"]["license"]["id"] == data["license"]["id"]
        # renewing on the same device is a 200 and keeps one license
        assert owner_api.post(url("offline", epub_ebook.book), **DEV).status_code == 200
        assert OfflineLicense.objects.count() == 1
        assert ReaderAccessLog.objects.filter(kind="offline").count() == 2

    def test_limit_and_revoke(self, owner_api, epub_ebook, settings):
        settings.READER_OFFLINE_MAX_BOOKS = 1
        assert owner_api.post(url("offline", epub_ebook.book), **dev(1)).status_code == 201
        res = owner_api.post(url("offline", epub_ebook.book), **dev(2))
        assert res.status_code == 409
        assert res.json()["code"] == "offline_limit"
        lic_id = res.json()["licenses"][0]["id"]
        listed = owner_api.get(url("offline-list")).json()
        assert [x["id"] for x in listed] == [lic_id]
        assert owner_api.delete(url("offline-license", pk=lic_id)).status_code == 204
        assert owner_api.delete(url("offline-license", pk=lic_id)).status_code == 404
        assert owner_api.post(url("offline", epub_ebook.book), **dev(2)).status_code == 201

    def test_expired_licenses_do_not_count(self, owner_api, epub_ebook, settings):
        settings.READER_OFFLINE_MAX_BOOKS = 1
        owner_api.post(url("offline", epub_ebook.book), **dev(1))
        OfflineLicense.objects.update(expires_at=timezone.now() - timezone.timedelta(days=1))
        assert owner_api.get(url("offline-list")).json() == []
        assert owner_api.post(url("offline", epub_ebook.book), **dev(2)).status_code == 201

    def test_disabled(self, owner_api, epub_ebook, settings):
        settings.READER_OFFLINE_ENABLED = False
        assert owner_api.get(url("read", epub_ebook.book), **DEV).json()["offline"] is None
        assert owner_api.post(url("offline", epub_ebook.book), **DEV).status_code == 404

    def test_requires_entitlement(self, api, stranger, epub_ebook):
        api.force_authenticate(stranger)
        assert api.post(url("offline", epub_ebook.book), **DEV).status_code == 403

    def test_others_cannot_revoke(self, owner_api, api, stranger, epub_ebook):
        lic_id = owner_api.post(url("offline", epub_ebook.book), **DEV).json()["license"]["id"]
        api.force_authenticate(stranger)
        assert api.delete(url("offline-license", pk=lic_id)).status_code == 404
