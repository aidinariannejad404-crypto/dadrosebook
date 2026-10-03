"""Phase 2 discovery: facets, search suggestions and the relaxed search fallback."""

from urllib.parse import quote

import pytest
from django.core.cache import cache

from apps.catalog.models import Book, Category, Person, Subject
from apps.catalog.services.search import search_books_relaxed, should_relax

from .conftest import make_book, print_variant

pytestmark = pytest.mark.django_db

FACETS = "/api/v1/catalog/books/facets/"
SUGGEST = "/api/v1/catalog/search/suggest/"
BOOKS = "/api/v1/catalog/books/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def get(api, url, **params):
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
    return api.get(f"{url}?{query}" if query else url)


def counts(items, key="slug"):
    return [(item[key], item["count"]) for item in items]


# --- facets -------------------------------------------------------------------------------------


def test_facets_without_filters(api, catalog):
    data = get(api, FACETS).json()
    assert set(data) == {
        "count",
        "subjects",
        "exam_types",
        "formats",
        "resource_types",
        "in_stock",
        "price",
    }
    assert data["count"] == 4  # the inactive book is never counted
    assert data["subjects"] == [
        {"slug": "حقوق-مدنی", "name": "حقوق مدنی", "color": "#1F4E8C", "count": 1},
        {"slug": "حقوق-تجارت", "name": "حقوق تجارت", "color": "#1E7A5A", "count": 1},
        {"slug": "متون-فقه", "name": "متون فقه", "color": "#6B5A3A", "count": 2},
    ]
    assert data["exam_types"] == [
        {"slug": "کانون-وکلا", "name": "کانون وکلا", "count": 3},
        {"slug": "مرکز-وکلا", "name": "مرکز وکلا", "count": 3},
    ]
    assert data["formats"] == [
        {"value": "PRINT", "label": "نسخه چاپی", "count": 4},
        {"value": "EBOOK", "label": "نسخه الکترونیک", "count": 1},
        {"value": "BUNDLE", "label": "چاپی + الکترونیک", "count": 1},
    ]
    assert data["resource_types"] == [
        {"value": "TEXTBOOK", "label": "درسنامه", "count": 3},
        {"value": "QUICK_REVIEW", "label": "سریع‌خوان", "count": 1},
    ]
    assert data["in_stock"] == 3
    # The quick-review book only has a placeholder price: it is left out of the range.
    assert data["price"] == {"min": 480_000, "max": 1_345_000}


def test_facet_excludes_its_own_filter(api, catalog):
    data = get(api, FACETS, subject="متون-فقه").json()
    assert data["count"] == 2
    # Subjects ignore ?subject= so the user can switch subject...
    assert counts(data["subjects"]) == [("حقوق-مدنی", 1), ("حقوق-تجارت", 1), ("متون-فقه", 2)]
    # ...while every other facet is narrowed to fiqh books.
    assert counts(data["exam_types"]) == [("کانون-وکلا", 1), ("مرکز-وکلا", 2)]
    assert counts(data["formats"], "value") == [("PRINT", 2)]
    assert data["in_stock"] == 1
    assert data["price"] == {"min": 480_000, "max": 480_000}


def test_facets_combine_other_filters(api, catalog):
    data = get(api, FACETS, subject="متون-فقه", exam_type="کانون-وکلا").json()
    assert data["count"] == 1
    assert counts(data["subjects"]) == [("حقوق-مدنی", 1), ("حقوق-تجارت", 1), ("متون-فقه", 1)]
    assert counts(data["exam_types"]) == [("کانون-وکلا", 1), ("مرکز-وکلا", 2)]


def test_facet_count_matches_list(api, catalog):
    params = {"exam_type": "مرکز-وکلا", "format": "print", "in_stock": "true", "ordering": "price"}
    facets = get(api, FACETS, **params).json()
    listing = get(api, BOOKS, **params).json()
    assert facets["count"] == listing["count"] == 2
    assert facets["in_stock"] == 2  # ignores ?in_stock=: the quick-review book is out of stock
    assert counts(facets["formats"], "value") == [
        ("PRINT", 2),
        ("EBOOK", 1),
        ("BUNDLE", 1),
    ]


def test_in_stock_and_price_facets_ignore_their_params(api, catalog):
    data = get(api, FACETS, in_stock="true", min_price=1_000_000).json()
    assert data["count"] == 1  # commerce book (1,345,000)
    assert data["in_stock"] == 1
    assert data["price"] == {"min": 480_000, "max": 1_345_000}


def test_price_range_null_when_only_placeholders(api, catalog):
    data = get(api, FACETS, q="سریع‌خوان").json()
    assert data["count"] == 1
    assert data["price"] == {"min": None, "max": None}


def test_inactive_subject_is_hidden(api, catalog):
    Subject.objects.filter(pk=catalog["commerce"].pk).update(is_active=False)
    assert "حقوق-تجارت" not in [s["slug"] for s in get(api, FACETS).json()["subjects"]]


def test_facets_route_is_not_a_book_slug(api, catalog):
    make_book("facets", variants=[print_variant(100_000)])
    assert "count" in get(api, FACETS).json()


# --- suggest ------------------------------------------------------------------------------------


def test_suggest_shape_and_lists(api, catalog):
    data = get(api, SUGGEST, q="مدنی").json()
    assert data["q"] == "مدنی"
    assert [b["title"] for b in data["books"]] == ["حقوق مدنی دوجلدی"]  # inactive book excluded
    assert set(data["books"][0]) == {
        "id",
        "title",
        "slug",
        "cover",
        "subjects",
        "authors",
        "card_price",
    }
    assert data["books"][0]["card_price"] == 2_200_000
    assert data["books"][0]["authors"][0]["name"] == "دکتر شکری"
    assert data["subjects"] == [
        {"id": catalog["civil"].id, "name": "حقوق مدنی", "slug": "حقوق-مدنی", "color": "#1F4E8C"}
    ]
    assert data["categories"] == [
        {"id": catalog["bar_civil"].id, "name": "مدنی وکالت", "slug": "مدنی-وکالت"}
    ]
    assert data["authors"] == []


def test_suggest_books_by_sales_and_limited(api, catalog):
    for i in range(8):
        make_book(f"کتاب فقه {i}", variants=[print_variant(100_000)], sales_count=i)
    books = get(api, SUGGEST, q="فقه").json()["books"]
    assert len(books) == 6
    assert books[0]["title"] == "۱۱۰۰ تست برگزیده متون فقه"  # sales 75


@pytest.mark.parametrize("q", ["", "م", " م ", "ـ"])
def test_suggest_short_query_is_empty(api, catalog, q):
    data = get(api, SUGGEST, q=q).json()
    assert data["books"] == data["subjects"] == data["categories"] == data["authors"] == []


@pytest.mark.parametrize("q", ["شكري", "شکری", "دكتر شكري"])
def test_suggest_authors_normalised(api, catalog, q):
    data = get(api, SUGGEST, q=q).json()
    assert [a["name"] for a in data["authors"]] == ["دکتر شکری"]
    assert [b["title"] for b in data["books"]] == ["حقوق مدنی دوجلدی"]


@pytest.mark.parametrize("q", ["سريع‌خوان", "سریع خوان", "سريعخوان"])
def test_suggest_yeh_and_zwnj(api, catalog, q):
    data = get(api, SUGGEST, q=q).json()
    assert [c["name"] for c in data["categories"]] == ["سریع‌خوان"]
    assert [b["title"] for b in data["books"]] == ["سریع‌خوان متون فقه مرکز وکلا"]


def test_suggest_authors_need_an_active_book(api, catalog):
    ghost = Person.objects.create(name="دکتر شکرالهی")
    catalog["inactive"].authors.add(ghost)
    Person.objects.create(name="دکتر شکوهی")  # no books at all
    names = [a["name"] for a in get(api, SUGGEST, q="دکتر").json()["authors"]]
    assert names == ["دکتر شکری"]


def test_suggest_inactive_category_hidden(api, catalog):
    Category.objects.filter(pk=catalog["quick_cat"].pk).update(is_active=False)
    assert get(api, SUGGEST, q="سریع").json()["categories"] == []


def test_suggest_is_cached_per_normalised_query(api, catalog):
    first = get(api, SUGGEST, q="مدني").json()
    Book.objects.filter(pk=catalog["civil_book"].pk).update(is_active=False)
    assert get(api, SUGGEST, q="مدنی").json() == first  # ي and ی share one cache entry
    cache.clear()
    assert get(api, SUGGEST, q="مدنی").json()["books"] == []


# --- relaxed search -----------------------------------------------------------------------------


def test_should_relax():
    assert should_relax("حقوق جزا")
    assert not should_relax("حقوق")
    assert not should_relax("  ")


def test_relaxed_ranks_by_tokens_matched(catalog):
    qs = search_books_relaxed(
        Book.objects.filter(is_active=True).order_by("title"), "حقوق مدنی جزا"
    )
    assert [(b.title, b.matched_tokens) for b in qs] == [
        ("حقوق مدنی دوجلدی", 2),
        ("درسنامه جامع حقوق تجارت", 1),
    ]


def test_list_falls_back_to_relaxed_search(api, catalog):
    response = get(api, BOOKS, q="حقوق مدنی جزا", ordering="-price")
    assert response["X-Search-Relaxed"] == "1"
    # More matched tokens wins over the requested ordering, which breaks ties.
    assert [b["title"] for b in response.json()["results"]] == [
        "حقوق مدنی دوجلدی",
        "درسنامه جامع حقوق تجارت",
    ]


def test_relaxed_fallback_keeps_other_filters(api, catalog):
    response = get(api, BOOKS, q="حقوق جزا", subject="حقوق-تجارت")
    assert response["X-Search-Relaxed"] == "1"
    assert [b["title"] for b in response.json()["results"]] == ["درسنامه جامع حقوق تجارت"]
    facets = get(api, FACETS, q="حقوق جزا", subject="حقوق-تجارت").json()
    assert facets["count"] == 1
    assert counts(facets["subjects"]) == [("حقوق-مدنی", 1), ("حقوق-تجارت", 1)]


def test_no_fallback_when_strict_search_hits(api, catalog):
    response = get(api, BOOKS, q="متون فقه")
    assert "X-Search-Relaxed" not in response
    assert response.json()["count"] == 2


def test_no_fallback_for_single_token(api, catalog):
    response = get(api, BOOKS, q="جزا")
    assert "X-Search-Relaxed" not in response
    assert response.json()["count"] == 0
