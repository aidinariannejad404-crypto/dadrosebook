"""Unit tests for the services added after the competitor research (P1-*)."""

import datetime as dt
from types import SimpleNamespace as V

import pytest
from django.utils import timezone

from apps.catalog.models import Book, BookSamplePage, BookVariant, ExamEvent, Publisher
from apps.catalog.services.badges import MAX_BADGES, book_badges
from apps.catalog.services.books import book_card_queryset
from apps.catalog.services.completeness import (
    annotate_completeness,
    complete_q,
    completeness_checks,
    completeness_percent,
    missing_labels,
)
from apps.catalog.services.editions import current_exam_year, edition_badge, is_current_edition
from apps.catalog.services.pricing import book_card_variant, book_min_price, bundle_saving
from apps.catalog.services.social_proof import season_buyers, subject_rank
from apps.core.jalali import jalali_year

from .conftest import make_book, print_variant

ALL_BADGES = {
    "edition_badge": "ویرایش ۱۴۰۵",
    "kit_role": "essential",
    "subject_rank": 1,
    "subject_name": "حقوق مدنی",
    "is_quick_review": True,
    "has_bundle": True,
    "has_sample": True,
    "course_title": "دوره جامع حقوق مدنی ۱ تا ۸",
}


# --- badges -------------------------------------------------------------------------------------
def test_badges_priority_and_limit():
    badges = book_badges(**ALL_BADGES)
    assert len(badges) == MAX_BADGES == 2
    assert badges == [
        {"code": "edition", "label": "ویرایش ۱۴۰۵", "tone": "primary"},
        {"code": "kit_essential", "label": "ضروری کیت", "tone": "success"},
    ]


def test_badges_full_order_without_limit():
    codes = [b["code"] for b in book_badges(**ALL_BADGES, limit=10)]
    assert codes == [
        "edition", "kit_essential", "bestseller", "quick_review", "bundle", "sample", "course",
    ]  # fmt: skip
    tones = [b["tone"] for b in book_badges(**ALL_BADGES, limit=10)]
    assert tones == ["primary", "success", "accent", "warning", "info", "neutral", "info"]


def test_badges_lower_priorities_fill_free_slots():
    badges = book_badges(has_sample=True, course_title="دوره", is_quick_review=True)
    assert [b["code"] for b in badges] == ["quick_review", "sample"]
    assert book_badges(course_title="دوره") == [
        {"code": "course", "label": "منبع دوره دادرُز", "tone": "info"}
    ]
    assert book_badges() == []


def test_badges_optional_kit_role_and_rank_label():
    assert book_badges(kit_role="optional") == []
    badges = book_badges(subject_rank=2, subject_name="حقوق مدنی")
    assert badges == [{"code": "bestseller", "label": "پرفروش‌ترین #۲ حقوق مدنی", "tone": "accent"}]
    assert book_badges(subject_rank=1, subject_name=None) == []


# --- social proof -------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("sales", "ahead", "rank"),
    [(10, 0, 1), (10, 2, 3), (10, 3, None), (0, 0, None), (10, None, None)],
)
def test_subject_rank(sales, ahead, rank):
    assert subject_rank(sales, ahead) == rank


def test_season_buyers_threshold():
    assert season_buyers(0) is None
    assert season_buyers(19) is None
    assert season_buyers(20) == 20
    assert season_buyers(140) == 140


@pytest.mark.django_db
def test_subject_rank_annotation(catalog):
    fiqh = catalog["fiqh"]
    extra = [
        make_book(f"فقه {i}", subjects=[fiqh], variants=[print_variant(1)], sales_count=s)
        for i, s in enumerate([50, 50, 0])
    ]
    books = {b.title: b for b in book_card_queryset()}
    ahead = {t: b.books_ahead_in_subject for t, b in books.items()}
    assert ahead["۱۱۰۰ تست برگزیده متون فقه"] == 0  # 75 sales
    assert ahead[extra[0].title] == 1  # 50, lower id wins the tie
    assert ahead[extra[1].title] == 2
    assert ahead["سریع‌خوان متون فقه مرکز وکلا"] == 3  # 10 sales → rank 4
    assert ahead["حقوق مدنی دوجلدی"] == 0  # the inactive 999-sales book is not counted
    assert books["حقوق مدنی دوجلدی"].first_subject_id == catalog["civil"].id


# --- editions -----------------------------------------------------------------------------------
def test_edition_badge():
    assert edition_badge(1405, 1405) == "ویرایش ۱۴۰۵"
    assert edition_badge(1406, 1405) == "ویرایش ۱۴۰۶"
    assert edition_badge(1404, 1405) is None
    assert edition_badge(None, 1405) is None
    assert is_current_edition(1405, 1405) and not is_current_edition(None, 1405)


@pytest.mark.django_db
def test_current_exam_year(catalog):
    # The fixture's next upcoming event is 2099-11-05.
    assert current_exam_year() == jalali_year(dt.date(2099, 11, 5))
    soon = timezone.localdate() + dt.timedelta(days=30)
    ExamEvent.objects.create(name="نزدیک", exam_type=catalog["markaz"], date=soon)
    assert current_exam_year() == jalali_year(soon)
    ExamEvent.objects.all().delete()
    assert current_exam_year() == jalali_year(timezone.localdate())


# --- resource type ⇔ is_quick_review ------------------------------------------------------------
@pytest.mark.django_db
def test_resource_type_sync():
    flagged = Book.objects.create(title="الف", is_quick_review=True)
    assert flagged.resource_type == Book.ResourceType.QUICK_REVIEW
    typed = Book.objects.create(title="ب", resource_type=Book.ResourceType.QUICK_REVIEW)
    assert typed.is_quick_review is True
    tests = Book.objects.create(title="پ", resource_type="TESTS", is_quick_review=True)
    assert tests.is_quick_review is False  # an explicit resource type wins on create

    book = Book.objects.get(pk=typed.pk)
    book.resource_type = Book.ResourceType.LAWS
    book.save()
    book.refresh_from_db()
    assert (book.resource_type, book.is_quick_review) == ("LAWS", False)

    book = Book.objects.get(pk=flagged.pk)
    book.is_quick_review = False
    book.save()
    book.refresh_from_db()
    assert (book.resource_type, book.is_quick_review) == ("TEXTBOOK", False)

    book = Book.objects.get(pk=tests.pk)
    book.is_quick_review = True
    book.save(update_fields=["is_quick_review"])
    book.refresh_from_db()
    assert (book.resource_type, book.is_quick_review) == ("QUICK_REVIEW", True)


# --- pricing ------------------------------------------------------------------------------------
def _v(type_, price, sale=None, placeholder=False):
    return BookVariant(type=type_, price=price, sale_price=sale, price_is_placeholder=placeholder)


def test_placeholder_prices_are_never_shown():
    ebook = _v("EBOOK", 500_000, placeholder=True)
    print_ = _v("PRINT", 900_000, placeholder=True)
    bundle = _v("BUNDLE", 1_000_000)
    assert book_min_price([ebook, print_, bundle]) == 1_000_000
    assert book_card_variant([ebook, print_, bundle]) is bundle
    assert book_min_price([ebook, print_]) is None
    assert book_card_variant([ebook, print_]) is None
    assert book_card_variant([V(type="EBOOK", effective_price=1)]).type == "EBOOK"


def test_bundle_saving():
    trio = [_v("PRINT", 2_200_000), _v("EBOOK", 990_000), _v("BUNDLE", 2_750_000)]
    assert bundle_saving(trio) == 440_000
    on_sale = [_v("PRINT", 2_200_000, 2_000_000), _v("EBOOK", 990_000), _v("BUNDLE", 2_750_000)]
    assert bundle_saving(on_sale) == 240_000
    assert bundle_saving(trio[:2]) is None
    assert bundle_saving([trio[0], _v("EBOOK", 990_000, placeholder=True), trio[2]]) is None
    assert bundle_saving([_v("PRINT", 1), _v("EBOOK", 1), _v("BUNDLE", 5)]) is None
    assert bundle_saving([_v("PRINT", 1), _v("EBOOK", 1), _v("BUNDLE", 2)]) is None  # zero


# --- completeness -------------------------------------------------------------------------------
@pytest.mark.django_db
def test_completeness(catalog):
    bare = make_book("خالی", variants=[print_variant(100, price_is_placeholder=True)])
    assert completeness_percent(bare) == 0
    assert "قیمت قطعی" in missing_labels(bare) and len(missing_labels(bare)) == 8

    full = make_book(
        "کامل",
        variants=[print_variant(100)],
        cover="covers/x.jpg",
        isbn="978-600-0000-00-0",
        table_of_contents="فصل ۱",
        study_plan_note="یادداشت",
        description="<p>معرفی</p>",
        publisher=Publisher.objects.create(name="ناشر"),
    )
    assert completeness_percent(full) == 87  # 7/8: no sample yet
    assert missing_labels(full) == ["نمونه"]
    BookSamplePage.objects.create(book=full, image="samples/pages/1.jpg")
    assert completeness_checks(full)["sample"] is True
    assert completeness_percent(full) == 100

    qs = annotate_completeness(Book.objects.all())
    assert list(qs.filter(complete_q()).values_list("title", flat=True)) == ["کامل"]
    assert "خالی" in qs.exclude(complete_q()).values_list("title", flat=True)
