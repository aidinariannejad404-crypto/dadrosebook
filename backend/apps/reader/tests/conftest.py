import pytest
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Book
from apps.library.models import EbookFile
from apps.library.services import entitlements
from apps.reader.services import access

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture(autouse=True)
def default_checker(settings):
    """Run against the real Phase 3 entitlement check."""
    settings.READER_ENTITLEMENT_CHECKER = access.DEFAULT_CHECKER
    access._load_checker.cache_clear()
    yield
    access._load_checker.cache_clear()


@pytest.fixture
def grant(db):
    def _grant(user, book):
        return entitlements.grant(user, book)

    return _grant


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def reader(db):
    return User.objects.create_user(phone="09121234567")


@pytest.fixture
def stranger(db):
    return User.objects.create_user(phone="09351112233")


@pytest.fixture
def staff(db):
    return User.objects.create_user(phone="09190000000", is_staff=True)


@pytest.fixture
def book(db):
    return Book.objects.create(title="حقوق مدنی ۱")


@pytest.fixture
def ebook(book):
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1)
    ebook.file.save("civil.pdf", ContentFile(PDF_BYTES), save=True)
    yield ebook
    ebook.file.delete(save=False)


@pytest.fixture
def owner_api(api, reader, book, grant):
    grant(reader, book)
    api.force_authenticate(reader)
    return api


@pytest.fixture
def make_epub_file(book):
    """Attach an EPUB (the sample by default) to ``book`` and return the EbookFile."""
    from apps.reader.sample_epub import build_epub

    made = []

    def _make(data: bytes | None = None, version: int = 1):
        ebook = EbookFile(book=book, format=EbookFile.Format.EPUB, version=version)
        ebook.file.save("civil.epub", ContentFile(data or build_epub()), save=True)
        made.append(ebook)
        return ebook

    yield _make
    for ebook in made:
        from apps.reader.services.epub import delete_package

        delete_package(ebook)
        ebook.file.delete(save=False)


@pytest.fixture
def epub_ebook(make_epub_file):
    return make_epub_file()
