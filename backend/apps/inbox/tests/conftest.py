import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import tokens
from apps.catalog.models import Book, BookVariant, ExamType, Subject


@pytest.fixture(autouse=True)
def _clear_cache(settings):
    settings.SMS_PROVIDER = "console"
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user("09121234567", first_name="سارا")


def client_for(user):
    client = APIClient()
    access, refresh = tokens.issue_pair(user)
    client.cookies["dr_access"] = access
    client.cookies["dr_refresh"] = refresh
    return client


@pytest.fixture
def auth_api(user):
    return client_for(user)


@pytest.fixture
def sent(monkeypatch):
    """SMS texts handed to the console provider: ``[(phone, text), …]``."""
    from apps.accounts.sms import ConsoleSmsProvider

    out: list[tuple[str, str]] = []
    monkeypatch.setattr(ConsoleSmsProvider, "send", lambda self, p, m: out.append((p, m)))
    return out


@pytest.fixture
def exam(db):
    return ExamType.objects.create(name="وکالت", slug="vekalat")


@pytest.fixture
def subjects(db):
    return [
        Subject.objects.create(name=n, slug=s, color="#1F4E8C")
        for n, s in [("مدنی", "madani"), ("تجارت", "tejarat"), ("جزا", "jaza"), ("آیین", "aein")]
    ]


@pytest.fixture
def make_ebook(db, subjects):
    def _make(title):
        book = Book.objects.create(title=title)
        book.subjects.set([subjects[0]])
        BookVariant.objects.create(book=book, type=BookVariant.Type.EBOOK, price=990_000)
        return book

    return _make
