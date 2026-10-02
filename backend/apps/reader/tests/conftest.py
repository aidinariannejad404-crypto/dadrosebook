import pytest
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Book
from apps.reader.models import EbookFile
from apps.reader.services import access

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"

# (user_id, book_id) pairs the fake checker grants.
GRANTS: set[tuple[int, int]] = set()


def fake_checker(user, book) -> bool:
    return (user.pk, book.pk) in GRANTS


@pytest.fixture(autouse=True)
def entitlement_checker(settings):
    settings.READER_ENTITLEMENT_CHECKER = "apps.reader.tests.conftest.fake_checker"
    GRANTS.clear()
    access._load_checker.cache_clear()
    yield GRANTS
    GRANTS.clear()
    access._load_checker.cache_clear()


@pytest.fixture
def grant():
    def _grant(user, book):
        GRANTS.add((user.pk, book.pk))

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
    ebook = EbookFile(book=book, format=EbookFile.Format.PDF, version=1, pages=12)
    ebook.file.save("civil.pdf", ContentFile(PDF_BYTES), save=True)
    yield ebook
    ebook.file.delete(save=False)


@pytest.fixture
def owner_api(api, reader, book, grant):
    grant(reader, book)
    api.force_authenticate(reader)
    return api
