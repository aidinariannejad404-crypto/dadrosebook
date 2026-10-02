import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Book, BookVariant, Subject


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user("09121234567")


@pytest.fixture
def other_user(db):
    return User.objects.create_user("09351234567")


@pytest.fixture
def make_book(db):
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C")

    def _make(title, **kw):
        book = Book.objects.create(title=title, **kw)
        book.subjects.set([civil])
        BookVariant.objects.create(book=book, type=BookVariant.Type.EBOOK, price=990_000)
        return book

    return _make
