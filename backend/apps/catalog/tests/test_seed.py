import datetime as dt

import jdatetime
import pytest
from django.core.management import call_command

from apps.catalog import seed_data
from apps.catalog.models import (
    Book,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.content.models import Banner, GuideVideo

pytestmark = pytest.mark.django_db


def snapshot():
    models = [
        Book, BookVariant, Category, ExamEvent, ExamType, Person, StudyKitItem,
        StudyKitRecommendation, Subject, Banner, GuideVideo,
    ]  # fmt: skip
    return {m.__name__: m.objects.count() for m in models}


def test_seed_is_idempotent():
    call_command("seed_catalog")
    first = snapshot()
    call_command("seed_catalog")
    assert snapshot() == first
    assert first["Book"] == 13
    assert first["ExamType"] == 5
    assert first["Subject"] == 10
    assert first["BookVariant"] == 9 * 3 + 4
    assert first["Banner"] == 2
    assert first["GuideVideo"] == 3


def test_seed_content():
    call_command("seed_catalog")
    civil = Book.objects.get(slug="حقوق-مدنی-دوجلدی-دکتر-شکری")
    assert civil.is_featured and civil.volumes == 2
    assert civil.variants.get(type="PRINT").price == 2_200_000
    ebook = civil.variants.get(type="EBOOK")
    bundle = civil.variants.get(type="BUNDLE")
    assert ebook.price_is_placeholder and bundle.price_is_placeholder
    assert ebook.price == 990_000 and bundle.price == 2_750_000
    assert bundle.stock == civil.variants.get(type="PRINT").stock
    assert civil.related_courses.get().price == 8_125_000

    procedure = Book.objects.filter(title="آیین دادرسی مدنی")
    assert procedure.count() == 2
    assert len({b.slug for b in procedure}) == 2

    commerce = Book.objects.get(title="درسنامه جامع حقوق تجارت")
    assert commerce.variants.get(type="PRINT").sale_price == 1_345_000

    fiqh = Book.objects.get(title="متون فقه کانون وکلا")
    assert [e.name for e in fiqh.exam_types.all()] == ["کانون وکلا"]

    quick = Book.objects.filter(is_quick_review=True)
    assert quick.count() == 4
    for book in quick:
        variants = list(book.variants.all())
        assert [v.type for v in variants] == ["PRINT"]
        assert variants[0].stock == 0 and variants[0].price_is_placeholder
        assert book.categories.filter(slug="سریع-خوان").exists()

    sales = list(Book.objects.order_by("id").values_list("sales_count", flat=True))
    assert sales == sorted(sales, reverse=True)

    assert Subject.objects.get(name="قوانین خاص").color == "#3F6B6B"
    bar = Category.objects.get(name="آزمون وکالت")
    assert bar.children.count() == 10
    assert StudyKitRecommendation.objects.filter(exam_type__name="کانون وکلا").exists()
    assert Banner.objects.get(placement="HERO").link_url == "/kit"


def test_exam_event_dates():
    for _name, _type, (y, m, d), expected in seed_data.EXAM_EVENTS:
        assert jdatetime.date(y, m, d).togregorian() == expected
    assert jdatetime.date(1405, 8, 14).togregorian() == dt.date(2026, 11, 5)
    assert jdatetime.date(1405, 9, 20).togregorian() == dt.date(2026, 12, 11)
    call_command("seed_catalog")
    assert ExamEvent.objects.get(name="آزمون کانون وکلا ۱۴۰۵").date == dt.date(2026, 11, 5)
    assert ExamEvent.objects.get(name="آزمون مرکز وکلا ۱۴۰۵").date == dt.date(2026, 12, 11)


def test_superuser_only_when_debug(settings):
    from apps.accounts.models import User

    settings.DEBUG = False
    call_command("seed_catalog", "--with-superuser")
    assert not User.objects.filter(phone="09120000000").exists()
    settings.DEBUG = True
    call_command("seed_catalog", "--with-superuser")
    call_command("seed_catalog", "--with-superuser")
    admin = User.objects.get(phone="09120000000")
    assert admin.is_superuser and admin.check_password("admin")


def test_search_on_seeded_data():
    from apps.catalog.services.search import search_books

    call_command("seed_catalog")
    assert search_books(Book.objects.all(), "سريع").count() == 4
    assert search_books(Book.objects.all(), "شب خیز").count() == 1
    assert search_books(Book.objects.all(), "شبخیز").count() == 1


def test_seed_resource_types_and_weights():
    call_command("seed_catalog")
    call_command("seed_catalog")
    assert Book.objects.get(title="۱۱۰۰ تست برگزیده متون فقه").resource_type == "TESTS"
    quick = Book.objects.filter(resource_type="QUICK_REVIEW")
    assert quick.count() == 4 and all(b.is_quick_review for b in quick)
    assert Book.objects.filter(is_quick_review=True).count() == 4
    assert Book.objects.filter(resource_type="TEXTBOOK").count() == 8

    kanoon = {
        r.subject.name: r.weight
        for r in StudyKitRecommendation.objects.filter(exam_type__name="کانون وکلا")
    }
    expected = seed_data.SUBJECT_WEIGHTS["کانون وکلا"]
    assert {name: kanoon[name] for name in expected} == expected
    assert expected["حقوق مدنی"] == 4 and expected["حقوق جزا"] == 3
    assert set(
        StudyKitRecommendation.objects.filter(exam_type__name="مرکز وکلا").values_list(
            "weight", flat=True
        )
    ) == {None}
