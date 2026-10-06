import pytest
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from apps.library.models import EbookFile
from apps.reader.services import access


def allow_all(user, book):
    return True


@pytest.mark.django_db
class TestCanRead:
    def test_anonymous_and_inactive_users_cannot_read(self, book, reader, grant):
        grant(reader, book)
        assert not access.can_read(AnonymousUser(), book)
        assert not access.can_read(None, book)
        reader.is_active = False
        assert not access.can_read(reader, book)

    def test_entitled_user_can_read(self, book, reader, stranger, grant):
        grant(reader, book)
        assert access.can_read(reader, book)
        assert not access.can_read(stranger, book)

    def test_staff_preview_toggle(self, book, staff, settings):
        assert access.can_read(staff, book)
        settings.READER_STAFF_PREVIEW = False
        assert not access.can_read(staff, book)

    def test_revoked_entitlement_denies(self, book, reader, grant):
        ent = grant(reader, book)
        ent.revoked_at = timezone.now()
        ent.save()
        assert not access.can_read(reader, book)

    def test_checker_is_swappable(self, book, stranger, settings):
        settings.READER_ENTITLEMENT_CHECKER = "apps.reader.tests.test_access.allow_all"
        access._load_checker.cache_clear()
        assert access.can_read(stranger, book)


@pytest.mark.django_db
class TestActiveFile:
    def test_missing_file_raises(self, book):
        with pytest.raises(access.NoEbook):
            access.active_file(book)

    def test_inactive_file_is_ignored(self, ebook):
        ebook.is_active = False
        ebook.save()
        with pytest.raises(access.NoEbook):
            access.active_file(ebook.book)

    def test_returns_newest_active_file(self, ebook):
        assert access.active_file(ebook.book) == ebook
        newer = EbookFile.objects.create(book=ebook.book, file="ebooks/x/v2.pdf", version=2)
        assert access.active_file(ebook.book) == newer

    def test_private_storage_has_no_public_url(self, ebook):
        with pytest.raises(NotImplementedError):
            ebook.file.url  # noqa: B018
