import pytest
from django.contrib.auth.models import AnonymousUser

from apps.reader.models import EbookFile
from apps.reader.services import access


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

    def test_default_checker_denies_without_library_app(self, book, reader, settings):
        settings.READER_ENTITLEMENT_CHECKER = access.DEFAULT_CHECKER
        access._load_checker.cache_clear()
        assert not access.can_read(reader, book)


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

    def test_returns_active_file(self, ebook):
        assert access.active_file(ebook.book) == ebook
        assert ebook.file.name.startswith(f"ebooks/{ebook.book_id}/")
        assert "civil" not in ebook.file.name  # random name, not guessable from the upload

    def test_private_storage_has_no_public_url(self, ebook):
        with pytest.raises(NotImplementedError):
            ebook.file.url  # noqa: B018

    def test_one_active_file_per_book(self, ebook):
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            EbookFile.objects.create(book=ebook.book, file="ebooks/x.pdf", is_active=True)
