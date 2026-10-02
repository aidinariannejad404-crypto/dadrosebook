import pytest
from django.urls import reverse

from apps.reader.models import Highlight, ReadingProgress
from apps.reader.tests.conftest import PDF_BYTES


def read_url(book):
    return reverse("reader:read", kwargs={"slug": book.slug})


def progress_url(book):
    return reverse("reader:progress", kwargs={"slug": book.slug})


def highlights_url(book):
    return reverse("reader:highlights", kwargs={"slug": book.slug})


def highlight_url(book, pk):
    return reverse("reader:highlight", kwargs={"slug": book.slug, "pk": pk})


RECT = {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.03}


@pytest.mark.django_db
class TestRead:
    def test_requires_login(self, api, ebook):
        res = api.get(read_url(ebook.book))
        assert res.status_code == 401
        assert res.json()["detail"] == "برای مطالعه وارد حساب خود شوید."

    def test_forbidden_without_entitlement(self, api, stranger, ebook):
        api.force_authenticate(stranger)
        res = api.get(read_url(ebook.book))
        assert res.status_code == 403
        assert res.json()["code"] == "no_entitlement"

    def test_404_without_ebook(self, owner_api, book):
        res = owner_api.get(read_url(book))
        assert res.status_code == 404
        assert res.json()["code"] == "no_ebook"

    def test_unknown_book(self, owner_api):
        assert owner_api.get(reverse("reader:read", kwargs={"slug": "nope"})).status_code == 404

    def test_session_payload(self, owner_api, ebook, reader):
        ReadingProgress.objects.create(user=reader, book=ebook.book, page=4, total_pages=12)
        res = owner_api.get(read_url(ebook.book))
        assert res.status_code == 200
        assert "no-store" in res["Cache-Control"] and "private" in res["Cache-Control"]
        data = res.json()
        assert data["book"]["title"] == "حقوق مدنی ۱"
        assert data["file"]["format"] == "PDF"
        assert data["file"]["pages"] == 12
        assert "/api/v1/library/files/" in data["file"]["url"]
        assert ebook.file.name not in data["file"]["url"]  # storage path never leaks
        assert data["progress"]["page"] == 4
        assert data["watermark"].startswith("0912***4567")

    def test_inactive_book_stays_readable_for_owner(self, owner_api, ebook):
        ebook.book.is_active = False
        ebook.book.save()
        assert owner_api.get(read_url(ebook.book)).status_code == 200


@pytest.mark.django_db
class TestFile:
    def test_signed_url_streams_inline_pdf(self, owner_api, api, ebook):
        url = owner_api.get(read_url(ebook.book)).json()["file"]["url"]
        api.force_authenticate(None)
        res = api.get(url)  # self-authenticating: no session needed
        assert res.status_code == 200
        assert res["Content-Type"] == "application/pdf"
        assert res["Content-Disposition"] == "inline"
        assert "no-store" in res["Cache-Control"]
        assert b"".join(res.streaming_content) == PDF_BYTES

    def test_garbage_token(self, api, ebook):
        res = api.get(reverse("reader:file", kwargs={"token": "garbage"}))
        assert res.status_code == 403
        assert res.json()["code"] == "invalid_token"

    def test_deactivated_file(self, owner_api, api, ebook):
        url = owner_api.get(read_url(ebook.book)).json()["file"]["url"]
        ebook.is_active = False
        ebook.save()
        assert api.get(url).status_code == 404

    def test_no_public_media_route_for_private_files(self, api, ebook):
        assert api.get(f"/media/{ebook.file.name}").status_code == 404
        assert api.get(f"/private_media/{ebook.file.name}").status_code == 404


@pytest.mark.django_db
class TestProgressApi:
    def test_round_trip(self, owner_api, ebook):
        assert owner_api.get(progress_url(ebook.book)).json()["code"] == "no_progress"
        res = owner_api.put(progress_url(ebook.book), {"page": 6, "total_pages": 12}, format="json")
        assert res.status_code == 200
        assert res.json()["percent"] == 50.0
        assert owner_api.get(progress_url(ebook.book)).json()["page"] == 6

    def test_rejects_page_past_end(self, owner_api, ebook):
        res = owner_api.put(
            progress_url(ebook.book), {"page": 13, "total_pages": 12}, format="json"
        )
        assert res.status_code == 400

    def test_requires_entitlement(self, api, stranger, ebook):
        api.force_authenticate(stranger)
        assert api.put(progress_url(ebook.book), {"page": 1}, format="json").status_code == 403


@pytest.mark.django_db
class TestHighlightApi:
    def create(self, client, book, **kw):
        body = {"page": 3, "text": "ماده ۱۰ قانون مدنی", "rects": [RECT], **kw}
        return client.post(highlights_url(book), body, format="json")

    def test_crud(self, owner_api, ebook):
        res = self.create(owner_api, ebook.book, color="green", note="مهم")
        assert res.status_code == 201
        hl = res.json()
        assert hl["color"] == "green" and hl["rects"] == [RECT]

        listed = owner_api.get(highlights_url(ebook.book), {"page": 3}).json()
        assert [h["id"] for h in listed] == [hl["id"]]
        assert owner_api.get(highlights_url(ebook.book), {"page": 4}).json() == []

        res = owner_api.patch(
            highlight_url(ebook.book, hl["id"]), {"note": "خیلی مهم"}, format="json"
        )
        assert res.json()["note"] == "خیلی مهم"

        assert owner_api.delete(highlight_url(ebook.book, hl["id"])).status_code == 204
        assert not Highlight.objects.exists()

    def test_validation(self, owner_api, ebook):
        assert self.create(owner_api, ebook.book, color="red").status_code == 400
        assert self.create(owner_api, ebook.book, rects="x").status_code == 400
        assert self.create(owner_api, ebook.book, page=0).status_code == 400
        assert self.create(owner_api, ebook.book, text="x" * 2001).status_code == 400
        res = owner_api.get(highlights_url(ebook.book), {"page": "abc"})
        assert res.status_code == 400

    def test_cannot_touch_other_users_highlights(self, owner_api, api, stranger, ebook, grant):
        hl = self.create(owner_api, ebook.book).json()
        grant(stranger, ebook.book)
        api.force_authenticate(stranger)
        assert api.get(highlights_url(ebook.book)).json() == []
        assert api.delete(highlight_url(ebook.book, hl["id"])).status_code == 404
        assert api.patch(highlight_url(ebook.book, hl["id"]), {"note": "x"}).status_code == 404

    def test_requires_entitlement(self, api, stranger, ebook):
        api.force_authenticate(stranger)
        assert self.create(api, ebook.book).status_code == 403
