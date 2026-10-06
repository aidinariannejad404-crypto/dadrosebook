"""Phase 6c: screenshot deterrence (protection level, trace codes, capture events)."""

import re

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.accounts.models import User
from apps.library.models import EbookFile
from apps.reader.models import ReaderAccessLog, ReaderTraceCode
from apps.reader.services import protection

DEV = {"HTTP_X_READER_DEVICE": "cccccccc-3333-4333-8333-000000000001"}
CODE = re.compile(r"^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$")


def url(name, book):
    return reverse(f"reader:{name}", kwargs={"slug": book.slug})


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


class TestNormalizeCode:
    @pytest.mark.parametrize(
        "text", ["K7Q2-M9XD", "k7q2m9xd", " k7q2 m9xd ", "k7q2—m9xd", "K۷Q۲-M۹XD"]
    )
    def test_variants(self, text):
        assert protection.normalize_code(text) == "K7Q2-M9XD"

    def test_partial_is_left_undashed(self):
        assert protection.normalize_code("k7q") == "K7Q"
        assert protection.normalize_code("") == ""

    def test_new_code_format(self):
        assert all(CODE.match(protection._new_code()) for _ in range(50))


@pytest.mark.django_db
class TestTraceCode:
    def test_stable_per_user_and_book(self, reader, stranger, book):
        first = protection.trace_code(reader, book)
        assert CODE.match(first)
        assert protection.trace_code(reader, book) == first
        assert protection.trace_code(stranger, book) != first
        assert ReaderTraceCode.objects.count() == 2

    def test_find_normalizes(self, reader, book):
        code = protection.trace_code(reader, book)
        found = protection.find(code.lower().replace("-", " "))
        assert found.user == reader and found.book == book
        assert protection.find("ZZZZ-ZZZZ") is None

    def test_collision_retries(self, reader, stranger, book, monkeypatch):
        taken = protection.trace_code(stranger, book)
        codes = iter([taken, "AAAA-BBBB"])
        monkeypatch.setattr(protection, "_new_code", lambda: next(codes))
        assert protection.trace_code(reader, book) == "AAAA-BBBB"


@pytest.mark.django_db
class TestSession:
    def test_session_carries_protection(self, owner_api, ebook):
        data = owner_api.get(url("read", ebook.book), **DEV).json()
        assert data["protection"]["level"] == "standard"
        assert CODE.match(data["protection"]["trace_code"])
        again = owner_api.get(url("read", ebook.book), **DEV).json()
        assert again["protection"]["trace_code"] == data["protection"]["trace_code"]

    def test_high_level(self, owner_api, ebook):
        ebook.protection = EbookFile.Protection.HIGH
        ebook.save(update_fields=["protection"])
        data = owner_api.get(url("read", ebook.book), **DEV).json()
        assert data["protection"]["level"] == "high"


@pytest.mark.django_db
class TestCaptureEvents:
    def post(self, client, book, kind="print_screen"):
        return client.post(url("capture-events", book), {"kind": kind}, format="json")

    def test_logged(self, owner_api, reader, ebook):
        assert self.post(owner_api, ebook.book).status_code == 204
        log = ReaderAccessLog.objects.get(kind=ReaderAccessLog.Kind.CAPTURE)
        assert (log.user, log.book, log.detail) == (reader, ebook.book, "print_screen")

    def test_invalid_kind(self, owner_api, ebook):
        assert self.post(owner_api, ebook.book, kind="selfie").status_code == 400

    def test_needs_entitlement(self, api, stranger, ebook):
        api.force_authenticate(stranger)
        assert self.post(api, ebook.book).status_code == 403
        assert not ReaderAccessLog.objects.filter(kind=ReaderAccessLog.Kind.CAPTURE).exists()

    def test_needs_login(self, api, ebook):
        assert self.post(api, ebook.book).status_code in (401, 403)

    def test_over_rate_is_dropped_silently(self, owner_api, ebook, settings):
        settings.READER_CAPTURE_EVENT_RATE = "2/hour"
        codes = [self.post(owner_api, ebook.book, kind="shortcut").status_code for _ in range(4)]
        assert codes == [204] * 4
        assert ReaderAccessLog.objects.filter(kind=ReaderAccessLog.Kind.CAPTURE).count() == 2


@pytest.fixture
def admin_client(client, db):
    admin = User.objects.create_superuser(phone="09120000000", password="pass")
    client.force_login(admin)
    return client


@pytest.mark.django_db
class TestAdmin:
    def test_search_by_code_in_any_form(self, admin_client, reader, stranger, book):
        code = protection.trace_code(reader, book)
        protection.trace_code(stranger, book)
        changelist = reverse("admin:reader_readertracecode_changelist")
        res = admin_client.get(changelist, {"q": code.lower().replace("-", "")})
        assert res.status_code == 200
        assert reader.phone in res.content.decode()
        assert stranger.phone not in res.content.decode()

    def test_ebook_admin_lists_protection(self, admin_client):
        res = admin_client.get(reverse("admin:library_ebookfile_changelist"))
        assert res.status_code == 200
        assert "سطح حفاظت" in res.content.decode()
