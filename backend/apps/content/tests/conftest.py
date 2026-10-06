import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.catalog.models import ExamEvent, ExamType, Person, Publisher, StudyKitItem, Subject
from apps.catalog.models import StudyKitRecommendation as Kit
from apps.catalog.tests.conftest import make_book, print_variant


def words(n: int) -> str:
    """An intro of exactly ``n`` words (ZWNJ words count once)."""
    return "<p>" + " ".join(["می‌شود"] * n) + "</p>"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def hub_world(db):
    """Exam + two subjects + an author/translator + a publisher with 4 active books."""
    import datetime as dt

    from django.utils import timezone

    kanoon = ExamType.objects.create(name="کانون وکلا", short_name="کانون", intro=words(160))
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)
    commerce = Subject.objects.create(name="حقوق تجارت", color="#1E7A5A", order=1)
    shokri = Person.objects.create(name="دکتر شکری", job_title="استاد دانشگاه")
    translator = Person.objects.create(name="مترجم نمونه")
    majd = Publisher.objects.create(name="مجد")
    books = [
        make_book(
            f"مدنی {i}",
            subjects=[civil],
            exam_types=[kanoon],
            authors=[shokri],
            variants=[print_variant(100_000 * (i + 1))],
            sales_count=10 * i,
            publisher=majd,
        )
        for i in range(3)
    ]
    tejarat = make_book(
        "تجارت جامع",
        subjects=[commerce],
        exam_types=[kanoon],
        variants=[print_variant(500_000)],
        sales_count=99,
        publisher=majd,
    )
    tejarat.translators.set([translator])
    make_book("غیرفعال", subjects=[civil], exam_types=[kanoon], authors=[shokri], is_active=False)
    kit_civil = Kit.objects.create(exam_type=kanoon, subject=civil, weight=3)
    kit_commerce = Kit.objects.create(exam_type=kanoon, subject=commerce, weight=5)
    StudyKitItem.objects.create(recommendation=kit_civil, book=books[0], is_essential=True)
    StudyKitItem.objects.create(recommendation=kit_commerce, book=tejarat, is_essential=False)
    ExamEvent.objects.create(
        name="آزمون کانون ۱۴۰۵",
        exam_type=kanoon,
        date=timezone.localdate() + dt.timedelta(days=30),
    )
    return {
        "exam": kanoon,
        "civil": civil,
        "commerce": commerce,
        "author": shokri,
        "translator": translator,
        "publisher": majd,
        "books": books,
        "tejarat": tejarat,
    }
