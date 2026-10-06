import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import ExamType, Subject
from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.library.services import entitlements
from apps.reader.services import access


@pytest.fixture(autouse=True)
def real_entitlement_checker(settings):
    settings.READER_ENTITLEMENT_CHECKER = access.DEFAULT_CHECKER
    access._load_checker.cache_clear()
    yield
    access._load_checker.cache_clear()


@pytest.fixture
def user(db):
    return User.objects.create_user(phone="09121234567")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(phone="09351234567")


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def auth_api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def civil(db):
    return Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)


@pytest.fixture
def commerce(db):
    return Subject.objects.create(name="حقوق تجارت", color="#1E7A5A", order=1)


@pytest.fixture
def kanoon(db):
    return ExamType.objects.create(name="کانون وکلا", short_name="کانون", order=0)


@pytest.fixture
def book(civil, kanoon):
    return make_book(
        "حقوق مدنی ۱",
        subjects=[civil],
        exam_types=[kanoon],
        pages=200,
        variants=[print_variant(1_000_000), ebook_variant(500_000)],
    )


@pytest.fixture
def book2(commerce):
    return make_book(
        "حقوق تجارت",
        subjects=[commerce],
        pages=100,
        variants=[print_variant(800_000), ebook_variant(400_000)],
    )


@pytest.fixture
def entitled(user, book, book2):
    entitlements.grant(user, book)
    entitlements.grant(user, book2)
    return user


@pytest.fixture
def sms_outbox(monkeypatch):
    """Messages handed to the SMS task (``(phone, text)`` tuples)."""
    sent = []
    monkeypatch.setattr("apps.accounts.tasks.send_sms.delay", lambda p, t: sent.append((p, t)))
    return sent
