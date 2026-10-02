import datetime as dt

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import (
    Book,
    BookCourse,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)


def make_book(title, *, subjects=(), exam_types=(), authors=(), categories=(), variants=(), **kw):
    book = Book.objects.create(title=title, **kw)
    book.subjects.set(subjects)
    book.exam_types.set(exam_types)
    book.authors.set(authors)
    book.categories.set(categories)
    for spec in variants:
        BookVariant.objects.create(book=book, **spec)
    book.refresh_from_db()
    return book


def print_variant(price, stock=10, **kw):
    return {"type": BookVariant.Type.PRINT, "price": price, "stock": stock, **kw}


def ebook_variant(price, **kw):
    return {"type": BookVariant.Type.EBOOK, "price": price, **kw}


def bundle_variant(price, stock=10, **kw):
    return {"type": BookVariant.Type.BUNDLE, "price": price, "stock": stock, **kw}


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def catalog(db):
    """A small catalogue covering every filter."""
    kanoon = ExamType.objects.create(name="کانون وکلا", short_name="کانون", order=0)
    markaz = ExamType.objects.create(name="مرکز وکلا", short_name="مرکز", order=1)
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)
    commerce = Subject.objects.create(name="حقوق تجارت", color="#1E7A5A", order=2)
    fiqh = Subject.objects.create(name="متون فقه", color="#6B5A3A", order=6)
    bar = Category.objects.create(name="آزمون وکالت")
    bar_civil = Category.objects.create(name="مدنی وکالت", parent=bar)
    quick_cat = Category.objects.create(name="سریع‌خوان")
    shokri = Person.objects.create(name="دکتر شکری")

    civil_book = make_book(
        "حقوق مدنی دوجلدی",
        subjects=[civil],
        exam_types=[kanoon, markaz],
        authors=[shokri],
        categories=[bar_civil],
        variants=[print_variant(2_200_000, 12), ebook_variant(990_000), bundle_variant(2_750_000)],
        sales_count=180,
        is_featured=True,
        volumes=2,
    )
    commerce_book = make_book(
        "درسنامه جامع حقوق تجارت",
        subjects=[commerce],
        exam_types=[kanoon],
        variants=[print_variant(1_495_000, 30, sale_price=1_345_000)],
        sales_count=135,
    )
    tests_book = make_book(
        "۱۱۰۰ تست برگزیده متون فقه",
        subjects=[fiqh],
        exam_types=[kanoon, markaz],
        categories=[bar],
        variants=[print_variant(480_000, 40)],
        sales_count=75,
    )
    quick_book = make_book(
        "سریع‌خوان متون فقه مرکز وکلا",
        subjects=[fiqh],
        exam_types=[markaz],
        categories=[quick_cat],
        variants=[print_variant(390_000, 0, price_is_placeholder=True)],
        is_quick_review=True,
        sales_count=10,
    )
    inactive = make_book(
        "کتاب غیرفعال",
        subjects=[civil],
        variants=[print_variant(100_000)],
        is_active=False,
        sales_count=999,
    )
    course = RelatedCourse.objects.create(
        title="دوره جامع حقوق مدنی ۱ تا ۸",
        url="https://dadrose.com/",
        price=8_125_000,
        course_type=RelatedCourse.CourseType.FULL,
        subject=civil,
    )
    BookCourse.objects.create(
        book=civil_book, course=course, relevance=BookCourse.Relevance.REFERENCED
    )
    ExamEvent.objects.create(name="آزمون گذشته", exam_type=kanoon, date=dt.date(2020, 1, 1))
    ExamEvent.objects.create(
        name="آزمون کانون وکلا ۱۴۰۵", exam_type=kanoon, date=dt.date(2099, 11, 5)
    )
    rec = StudyKitRecommendation.objects.create(exam_type=kanoon, subject=fiqh, note="نکته")
    StudyKitItem.objects.create(recommendation=rec, book=tests_book, order=1, is_essential=True)
    StudyKitItem.objects.create(recommendation=rec, book=quick_book, order=2, is_essential=False)
    return {
        "kanoon": kanoon,
        "markaz": markaz,
        "civil": civil,
        "commerce": commerce,
        "fiqh": fiqh,
        "bar": bar,
        "bar_civil": bar_civil,
        "quick_cat": quick_cat,
        "shokri": shokri,
        "civil_book": civil_book,
        "commerce_book": commerce_book,
        "tests_book": tests_book,
        "quick_book": quick_book,
        "inactive": inactive,
        "course": course,
        "rec": rec,
    }
