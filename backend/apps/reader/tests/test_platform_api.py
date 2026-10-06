"""Phase 6: EPUB streaming, devices, bookmarks, search, audit log."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import User
from apps.library.models import EbookFile
from apps.reader.models import Bookmark, EpubPackage, ReaderAccessLog, ReaderDevice
from apps.reader.sample_epub import PNG, build_epub

DEV = {"HTTP_X_READER_DEVICE": "aaaaaaaa-1111-4111-8111-000000000001"}


def dev(n: int) -> dict:
    return {"HTTP_X_READER_DEVICE": f"aaaaaaaa-1111-4111-8111-00000000000{n}"}


def url(name, book=None, **kwargs):
    if book is not None:
        kwargs["slug"] = book.slug
    return reverse(f"reader:{name}", kwargs=kwargs)


@pytest.fixture(autouse=True)
def loose_throttles(settings):
    settings.READER_CHAPTER_RATE = "1000/min"
    settings.READER_CHAPTER_DAY_RATE = "10000/day"
    settings.READER_SEARCH_RATE = "1000/min"
    settings.READER_DEVICE_REMOVE_RATE = "1000/day"
    from django.core.cache import cache

    cache.clear()


@pytest.mark.django_db
class TestEpubSession:
    def test_session_has_epub_info_and_no_file_url(self, owner_api, epub_ebook):
        res = owner_api.get(url("read", epub_ebook.book), **DEV)
        assert res.status_code == 200
        data = res.json()
        assert data["file"]["format"] == "EPUB"
        assert data["file"]["url"] == ""
        assert data["copy_limit"] == 1000
        info = data["epub"]
        assert info["direction"] == "rtl"
        assert [c["index"] for c in info["chapters"]] == [0, 1, 2]
        assert info["total_pages"] == sum(c["pages"] for c in info["chapters"])
        assert info["toc"][0] == {"title": "پیشگفتار", "chapter": 0, "anchor": "", "level": 0}

    def test_pdf_session_has_null_epub(self, owner_api, ebook):
        data = owner_api.get(url("read", ebook.book), **DEV).json()
        assert data["epub"] is None
        assert data["copy_limit"] == 1000

    def test_open_is_logged(self, owner_api, epub_ebook, reader):
        owner_api.get(url("read", epub_ebook.book), **DEV)
        log = ReaderAccessLog.objects.get()
        assert (log.kind, log.user, log.book) == ("open", reader, epub_ebook.book)
        assert log.device is not None

    def test_denied_is_logged(self, api, stranger, epub_ebook):
        api.force_authenticate(stranger)
        assert api.get(url("read", epub_ebook.book), **DEV).status_code == 403
        assert ReaderAccessLog.objects.get().kind == "denied"


@pytest.mark.django_db
class TestChapter:
    def test_chapter_payload(self, owner_api, epub_ebook):
        res = owner_api.get(url("epub-chapter", epub_ebook.book, index=1), **DEV)
        assert res.status_code == 200
        assert "no-store" in res["Cache-Control"]
        data = res.json()
        assert (data["index"], data["prev"], data["next"]) == (1, 0, 2)
        assert data["title"] == "فصل اول: اموال"
        assert 'id="epub-s1"' in data["html"]
        last = owner_api.get(url("epub-chapter", epub_ebook.book, index=2), **DEV).json()
        assert last["next"] is None

    def test_missing_chapter(self, owner_api, epub_ebook):
        res = owner_api.get(url("epub-chapter", epub_ebook.book, index=9), **DEV)
        assert res.status_code == 404

    def test_pdf_has_no_chapters(self, owner_api, ebook):
        res = owner_api.get(url("epub-chapter", ebook.book, index=0), **DEV)
        assert res.status_code == 404
        assert res.json()["code"] == "no_ebook"

    def test_requires_entitlement(self, api, stranger, epub_ebook):
        api.force_authenticate(stranger)
        res = api.get(url("epub-chapter", epub_ebook.book, index=0), **DEV)
        assert res.status_code == 403

    def test_image_signed_and_served(self, owner_api, api, epub_ebook):
        html = owner_api.get(url("epub-chapter", epub_ebook.book, index=0), **DEV).json()["html"]
        assert "/__asset__/" not in html
        src = html.split('<img src="', 1)[1].split('"', 1)[0]
        assert src.startswith("/api/v1/library/epub-assets/")
        anon = api.__class__()  # the token alone authorises the image
        res = anon.get(src)
        assert res.status_code == 200
        assert b"".join(res.streaming_content) == PNG
        assert res["Content-Type"] == "image/png"
        assert "no-store" in res["Cache-Control"]
        assert "sandbox" in res["Content-Security-Policy"]

    def test_tampered_asset_token(self, api, epub_ebook):
        res = api.get(url("epub-asset", token="bad:token"))
        assert res.status_code == 403

    def test_asset_token_dies_with_entitlement(self, owner_api, api, epub_ebook, reader):
        html = owner_api.get(url("epub-chapter", epub_ebook.book, index=0), **DEV).json()["html"]
        src = html.split('<img src="', 1)[1].split('"', 1)[0]
        reader.ebook_entitlements.update(revoked_at=timezone.now())
        assert api.__class__().get(src).status_code == 403

    def test_chapter_logged(self, owner_api, epub_ebook):
        owner_api.get(url("epub-chapter", epub_ebook.book, index=2), **DEV)
        log = ReaderAccessLog.objects.get(kind="chapter")
        assert log.detail == "2"

    def test_throttled_in_persian(self, owner_api, epub_ebook, settings):
        settings.READER_CHAPTER_RATE = "2/min"
        for _ in range(2):
            owner_api.get(url("epub-chapter", epub_ebook.book, index=0), **DEV)
        res = owner_api.get(url("epub-chapter", epub_ebook.book, index=0), **DEV)
        assert res.status_code == 429
        assert "کمی صبر کنید" in res.json()["detail"]


@pytest.mark.django_db
class TestDevices:
    def test_fourth_device_is_refused_until_one_is_removed(self, owner_api, epub_ebook):
        for n in (1, 2, 3):
            assert owner_api.get(url("read", epub_ebook.book), **dev(n)).status_code == 200
        res = owner_api.get(url("read", epub_ebook.book), **dev(4))
        assert res.status_code == 409
        body = res.json()
        assert body["code"] == "device_limit"
        assert len(body["devices"]) == 3
        assert isinstance(body["devices"][0]["id"], int)
        assert body["devices"][0]["current"] is False
        # chapters from the new device are refused too
        assert (
            owner_api.get(url("epub-chapter", epub_ebook.book, index=0), **dev(4)).status_code
            == 409
        )
        # a known device keeps working
        assert owner_api.get(url("read", epub_ebook.book), **dev(2)).status_code == 200

        listed = owner_api.get(url("devices"), **dev(1)).json()
        assert [d["current"] for d in listed].count(True) == 1
        assert owner_api.delete(url("device", pk=body["devices"][0]["id"])).status_code == 204
        assert owner_api.get(url("read", epub_ebook.book), **dev(4)).status_code == 200

    def test_removed_device_must_reregister(self, owner_api, epub_ebook, reader):
        owner_api.get(url("read", epub_ebook.book), **dev(1))
        device = ReaderDevice.objects.get(user=reader)
        assert owner_api.delete(url("device", pk=device.pk)).status_code == 204
        assert owner_api.delete(url("device", pk=device.pk)).status_code == 404
        assert owner_api.get(url("read", epub_ebook.book), **dev(1)).status_code == 200
        device.refresh_from_db()
        assert device.revoked_at is None

    def test_old_devices_do_not_count(self, owner_api, epub_ebook, reader):
        for n in (1, 2, 3):
            owner_api.get(url("read", epub_ebook.book), **dev(n))
        ReaderDevice.objects.filter(user=reader).update(
            last_seen=timezone.now() - timezone.timedelta(days=200)
        )
        assert owner_api.get(url("read", epub_ebook.book), **dev(4)).status_code == 200

    def test_missing_or_bad_header_is_one_unknown_device(self, owner_api, epub_ebook, reader):
        owner_api.get(url("read", epub_ebook.book))
        owner_api.get(url("read", epub_ebook.book), HTTP_X_READER_DEVICE="<script>")
        assert ReaderDevice.objects.filter(user=reader).count() == 1

    def test_only_a_hash_is_stored(self, owner_api, epub_ebook, reader):
        owner_api.get(url("read", epub_ebook.book), **DEV)
        device = ReaderDevice.objects.get(user=reader)
        assert DEV["HTTP_X_READER_DEVICE"] not in device.key
        assert len(device.key) == 64

    def test_label_from_user_agent(self, owner_api, epub_ebook, reader):
        ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"
        owner_api.get(url("read", epub_ebook.book), HTTP_USER_AGENT=ua, **DEV)
        assert ReaderDevice.objects.get(user=reader).label == "Chrome · Android"

    def test_staff_has_no_device_limit(self, api, staff, epub_ebook):
        api.force_authenticate(staff)
        for n in range(1, 6):
            assert api.get(url("read", epub_ebook.book), **dev(n)).status_code == 200

    def test_cannot_remove_someone_elses_device(self, owner_api, api, stranger, epub_ebook):
        owner_api.get(url("read", epub_ebook.book), **DEV)
        device = ReaderDevice.objects.get()
        api.force_authenticate(stranger)
        assert api.delete(url("device", pk=device.pk)).status_code == 404

    def test_devices_require_login(self, api):
        assert api.get(url("devices")).status_code == 401


@pytest.mark.django_db
class TestSearch:
    def test_search(self, owner_api, epub_ebook):
        res = owner_api.get(url("epub-search", epub_ebook.book), {"q": "ماده 19"}, **DEV)
        assert res.status_code == 200
        results = res.json()["results"]
        assert results[0]["chapter"] == 1 and results[0]["match"] == "ماده ۱۹"
        assert ReaderAccessLog.objects.filter(kind="search", detail="ماده 19").exists()

    def test_short_query(self, owner_api, epub_ebook):
        res = owner_api.get(url("epub-search", epub_ebook.book), {"q": "م"}, **DEV)
        assert res.status_code == 400

    def test_requires_entitlement(self, api, stranger, epub_ebook):
        api.force_authenticate(stranger)
        res = api.get(url("epub-search", epub_ebook.book), {"q": "ماده"}, **DEV)
        assert res.status_code == 403


@pytest.mark.django_db
class TestBookmarks:
    def test_crud(self, owner_api, ebook):
        list_url = url("bookmarks", ebook.book)
        res = owner_api.post(list_url, {"page": 5, "label": "ماده ۱۰"}, format="json")
        assert res.status_code == 201
        again = owner_api.post(list_url, {"page": 5}, format="json")
        assert again.status_code == 200 and again.json()["id"] == res.json()["id"]
        owner_api.post(list_url, {"page": 2}, format="json")
        assert [b["page"] for b in owner_api.get(list_url).json()] == [2, 5]
        pk = res.json()["id"]
        assert owner_api.delete(url("bookmark", ebook.book, pk=pk)).status_code == 204
        assert Bookmark.objects.count() == 1

    def test_epub_location(self, owner_api, epub_ebook):
        res = owner_api.post(
            url("bookmarks", epub_ebook.book), {"page": 3, "location": "epub:1:120"}, format="json"
        )
        assert res.json()["location"] == "epub:1:120"

    def test_validation(self, owner_api, ebook):
        res = owner_api.post(url("bookmarks", ebook.book), {"page": 0}, format="json")
        assert res.status_code == 400

    def test_requires_entitlement(self, api, stranger, ebook):
        api.force_authenticate(stranger)
        assert api.get(url("bookmarks", ebook.book)).status_code == 403

    def test_others_bookmarks_are_invisible(self, owner_api, api, stranger, ebook, grant):
        pk = owner_api.post(url("bookmarks", ebook.book), {"page": 1}, format="json").json()["id"]
        grant(stranger, ebook.book)
        api.force_authenticate(stranger)
        assert api.get(url("bookmarks", ebook.book)).json() == []
        assert api.delete(url("bookmark", ebook.book, pk=pk)).status_code == 404


@pytest.mark.django_db
class TestAdminUpload:
    def test_epub_upload_is_processed(self, client, book):
        admin = User.objects.create_superuser(phone="09120000000", password="pass")
        client.force_login(admin)
        res = client.post(
            reverse("admin:library_ebookfile_add"),
            {
                "book": book.pk,
                "format": "EPUB",
                "file": SimpleUploadedFile("b.epub", build_epub(), "application/epub+zip"),
                "version": 1,
                "is_active": "on",
            },
        )
        assert res.status_code == 302
        ebook = EbookFile.objects.get()
        assert EpubPackage.objects.get(ebook=ebook).chapters.count() == 3
        from apps.reader.services.epub import delete_package

        delete_package(ebook)
        ebook.file.delete(save=False)

    def test_broken_epub_rejected(self, client, book):
        admin = User.objects.create_superuser(phone="09120000000", password="pass")
        client.force_login(admin)
        res = client.post(
            reverse("admin:library_ebookfile_add"),
            {
                "book": book.pk,
                "format": "EPUB",
                "file": SimpleUploadedFile(
                    "b.epub", build_epub(omit=("META-INF/container.xml",)), "application/epub+zip"
                ),
                "version": 1,
                "is_active": "on",
            },
        )
        assert res.status_code == 200
        assert not EbookFile.objects.exists()

    def test_reader_admin_pages_render(self, client, owner_api, epub_ebook):
        owner_api.get(url("read", epub_ebook.book), **DEV)
        admin = User.objects.create_superuser(phone="09120000000", password="pass")
        client.force_login(admin)
        for model in (
            "epubpackage",
            "readerdevice",
            "readeraccesslog",
            "bookmark",
            "copyledger",
            "offlinelicense",
        ):
            assert client.get(reverse(f"admin:reader_{model}_changelist")).status_code == 200
