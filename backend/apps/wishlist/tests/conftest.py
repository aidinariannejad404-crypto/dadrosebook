import pytest
from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services.tokens import issue_pair
from apps.catalog.models import Book, BookVariant, ExamType


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()  # throttle counters
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


def login(client: APIClient, user) -> APIClient:
    access, _ = issue_pair(user)
    client.cookies[settings.AUTH_COOKIE_ACCESS] = access
    return client


@pytest.fixture
def user(db):
    return User.objects.create_user(phone="09121234567", first_name="علی", last_name="رضایی")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(phone="09351234567")


@pytest.fixture
def book(db):
    book = Book.objects.create(title="حقوق مدنی دوجلدی")
    BookVariant.objects.create(book=book, type=BookVariant.Type.PRINT, price=2_200_000, stock=5)
    book.refresh_from_db()
    return book


@pytest.fixture
def exam_type(db):
    return ExamType.objects.create(name="کانون وکلا", short_name="کانون")
