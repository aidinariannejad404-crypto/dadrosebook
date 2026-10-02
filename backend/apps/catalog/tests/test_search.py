import pytest

from apps.catalog.models import Book, Person
from apps.catalog.services.search import build_search_text, search_books

pytestmark = pytest.mark.django_db


def titles(qs):
    return {b.title for b in qs}


@pytest.mark.parametrize("q", ["سريع", "سریع", "سريع‌خوان", "سریع خوان", "سریعخوان"])
def test_yeh_and_zwnj_variants(catalog, q):
    assert titles(search_books(Book.objects.all(), q)) == {"سریع‌خوان متون فقه مرکز وکلا"}


@pytest.mark.parametrize("q", ["شكري", "شکری", "دكتر شكري"])
def test_kaf_and_author_name(catalog, q):
    assert titles(search_books(Book.objects.all(), q)) == {"حقوق مدنی دوجلدی"}


@pytest.mark.parametrize("q", ["۱۱۰۰", "1100", "١١٠٠", "۱۱۰۰ تست"])
def test_digits(catalog, q):
    assert titles(search_books(Book.objects.all(), q)) == {"۱۱۰۰ تست برگزیده متون فقه"}


def test_tokens_are_anded(catalog):
    assert titles(search_books(Book.objects.all(), "متون فقه")) == {
        "۱۱۰۰ تست برگزیده متون فقه",
        "سریع‌خوان متون فقه مرکز وکلا",
    }
    assert titles(search_books(Book.objects.all(), "متون تجارت")) == set()


def test_subject_name_is_searchable(catalog):
    assert "درسنامه جامع حقوق تجارت" in titles(search_books(Book.objects.all(), "تجارت"))


def test_empty_query_returns_everything(catalog):
    assert search_books(Book.objects.all(), "  ").count() == Book.objects.count()


def test_search_text_rebuilt_on_m2m_change(catalog):
    book = catalog["commerce_book"]
    assert "سینجلی" not in book.search_text
    book.authors.add(Person.objects.create(name="محسن سینجلي"))
    book.refresh_from_db()
    assert "سینجلی" in book.search_text
    book.authors.clear()
    book.refresh_from_db()
    assert "سینجلی" not in book.search_text


def test_search_text_rebuilt_on_reverse_m2m_and_rename(catalog):
    person = Person.objects.create(name="نویسنده اول")
    person.authored_books.add(catalog["tests_book"])
    catalog["tests_book"].refresh_from_db()
    assert "نویسنده اول" in catalog["tests_book"].search_text
    person.name = "نویسنده دوم"
    person.save()
    catalog["tests_book"].refresh_from_db()
    assert "نویسنده دوم" in catalog["tests_book"].search_text


def test_search_text_on_title_change(catalog):
    book = catalog["commerce_book"]
    book.title = "عنوان تازه"
    book.save()
    book.refresh_from_db()
    assert book.search_text == build_search_text(book)
    assert "عنوان تازه" in book.search_text


def test_description_is_sanitised(catalog):
    book = catalog["commerce_book"]
    book.description = (
        '<p onclick="x()">سلام</p><script>alert(1)</script><a href="javascript:x">l</a>'
    )
    book.save()
    book.refresh_from_db()
    assert "<script" not in book.description
    assert "onclick" not in book.description
    assert "javascript" not in book.description
    assert "<p>سلام</p>" in book.description
