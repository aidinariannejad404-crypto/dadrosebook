from urllib.parse import quote

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from .conftest import make_book, print_variant

pytestmark = pytest.mark.django_db

BOOK_CARD_KEYS = {
    "id", "title", "subtitle", "slug", "cover", "authors", "subjects", "exam_types", "min_price",
    "formats", "in_stock", "print_in_stock", "is_quick_review", "volumes",
}  # fmt: skip
BOOK_DETAIL_KEYS = BOOK_CARD_KEYS | {
    "publisher", "translators", "categories", "edition", "publish_year", "pages", "isbn",
    "description", "table_of_contents", "study_plan_note", "sample_pdf", "sample_pages",
    "intro_video_url", "variants", "related_courses", "kit_placements", "is_featured",
    "updated_at",
}  # fmt: skip
VARIANT_KEYS = {
    "id", "type", "type_label", "price", "sale_price", "effective_price", "discount_percent",
    "in_stock", "stock", "price_is_placeholder",
}  # fmt: skip
SUBJECT_KEYS = {"id", "name", "slug", "color"}
EXAM_TYPE_KEYS = {"id", "name", "slug", "short_name"}
PERSON_KEYS = {"id", "name", "slug"}
COURSE_KEYS = {"id", "title", "url", "price", "image"}

LIST = "/api/v1/catalog/books/"
CIVIL = "حقوق مدنی دوجلدی"
COMMERCE = "درسنامه جامع حقوق تجارت"
TESTS = "۱۱۰۰ تست برگزیده متون فقه"
QUICK = "سریع\u200cخوان متون فقه مرکز وکلا"


def list_titles(api, **params):
    response = api.get(LIST, params)
    assert response.status_code == 200, response.content
    return [r["title"] for r in response.json()["results"]]


def test_list_shape(api, catalog):
    data = api.get(LIST).json()
    assert set(data) == {"count", "next", "previous", "results"}
    assert data["count"] == 4  # inactive excluded
    card = data["results"][0]
    assert set(card) == BOOK_CARD_KEYS
    assert card["title"] == CIVIL  # default ordering -sales_count
    assert set(card["authors"][0]) == PERSON_KEYS
    assert set(card["subjects"][0]) == SUBJECT_KEYS
    assert set(card["exam_types"][0]) == EXAM_TYPE_KEYS
    assert card["formats"] == ["PRINT", "EBOOK", "BUNDLE"]
    assert card["min_price"] == 990_000
    assert card["in_stock"] is True and card["print_in_stock"] is True
    assert card["cover"] is None
    assert card["volumes"] == 2


def test_list_card_values_for_out_of_stock(api, catalog):
    results = api.get(LIST, {"quick_review": "true"}).json()["results"]
    assert len(results) == 1
    card = results[0]
    assert card["in_stock"] is False
    assert card["print_in_stock"] is False
    assert card["is_quick_review"] is True
    assert card["formats"] == ["PRINT"]


def test_list_query_count_is_bounded(api, catalog):
    for i in range(10):
        make_book(
            f"کتاب نمونه {i}",
            subjects=[catalog["civil"]],
            exam_types=[catalog["kanoon"]],
            authors=[catalog["shokri"]],
            variants=[print_variant(100_000 + i)],
        )
    with CaptureQueriesContext(connection) as ctx:
        response = api.get(LIST)
    assert response.json()["count"] == 14
    # count + page + authors + subjects + exam_types + variants
    assert len(ctx.captured_queries) <= 7, [q["sql"] for q in ctx.captured_queries]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"subject": "حقوق-مدنی"}, {CIVIL}),
        (
            {"subject": "حقوق-مدنی,حقوق-تجارت"},
            {CIVIL, COMMERCE},
        ),
        ({"exam_type": "مرکز-وکلا"}, {CIVIL, TESTS, QUICK}),
        ({"format": "ebook"}, {CIVIL}),
        ({"format": "bundle,ebook"}, {CIVIL}),
        ({"min_price": 1_000_000}, {COMMERCE}),
        ({"max_price": 480_000}, {TESTS, QUICK}),
        ({"min_price": 400_000, "max_price": 1_000_000}, {CIVIL, TESTS}),
        ({"in_stock": "true"}, {CIVIL, COMMERCE, TESTS}),
        ({"featured": "true"}, {CIVIL}),
        ({"q": "سريع"}, {QUICK}),
        ({"q": "1100"}, {TESTS}),
        ({"category": "آزمون-وکالت"}, {CIVIL, TESTS}),
        ({"category": "مدنی-وکالت"}, {CIVIL}),
        ({"category": "سریع-خوان"}, {QUICK}),
        ({"category": "ناموجود"}, set()),
    ],
)
def test_list_filters(api, catalog, params, expected):
    assert set(list_titles(api, **params)) == expected


def test_repeated_subject_param(api, catalog):
    response = api.get(f"{LIST}?subject=حقوق-مدنی&subject=حقوق-تجارت")
    assert {r["title"] for r in response.json()["results"]} == {
        CIVIL,
        COMMERCE,
    }


def test_multi_subject_no_duplicates(api, catalog):
    catalog["civil_book"].subjects.add(catalog["commerce"])
    titles = list_titles(api, subject="حقوق-مدنی,حقوق-تجارت")
    assert len(titles) == len(set(titles)) == 2


@pytest.mark.parametrize(
    ("ordering", "first"),
    [
        ("-sales_count", CIVIL),
        ("price", QUICK),
        ("-price", COMMERCE),
        ("-created_at", QUICK),
        ("bogus", CIVIL),
    ],
)
def test_list_ordering(api, catalog, ordering, first):
    assert list_titles(api, ordering=ordering)[0] == first


def test_list_ordering_by_title(api, catalog):
    titles = list_titles(api, ordering="title")
    persian = [t for t in titles if not t.startswith("۱")]  # digit collation varies by locale
    assert persian == [
        CIVIL,
        COMMERCE,
        QUICK,
    ]


def test_pagination(api, catalog):
    data = api.get(LIST, {"page_size": 2}).json()
    assert len(data["results"]) == 2 and data["next"] is not None
    data = api.get(LIST, {"page_size": 1000}).json()
    assert len(data["results"]) == 4  # capped at 48, only 4 books


def test_detail_shape_and_persian_slug_url(api, catalog):
    book = catalog["civil_book"]
    assert book.slug == "حقوق-مدنی-دوجلدی"
    response = api.get(f"{LIST}{quote(book.slug)}/")
    assert response.status_code == 200
    data = response.json()
    assert set(data) == BOOK_DETAIL_KEYS
    assert [v["type"] for v in data["variants"]] == ["PRINT", "EBOOK", "BUNDLE"]
    for v in data["variants"]:
        assert set(v) == VARIANT_KEYS
    ebook = data["variants"][1]
    assert ebook["stock"] is None and ebook["in_stock"] is True
    assert ebook["type_label"] == "نسخه الکترونیک"
    assert data["variants"][0]["type_label"] == "نسخه چاپی"
    assert data["variants"][2]["type_label"] == "چاپی + الکترونیک"
    assert data["publisher"] is None
    assert data["categories"] == [
        {"id": catalog["bar_civil"].id, "name": "مدنی وکالت", "slug": "مدنی-وکالت"}
    ]
    assert set(data["related_courses"][0]) == COURSE_KEYS
    assert data["related_courses"][0]["price"] == 8_125_000
    assert data["kit_placements"] == []
    assert data["sample_pages"] == [] and data["sample_pdf"] is None


def test_detail_discount_and_kit_placement(api, catalog):
    data = api.get(f"{LIST}{quote(catalog['commerce_book'].slug)}/").json()
    v = data["variants"][0]
    assert (v["price"], v["sale_price"], v["effective_price"], v["discount_percent"]) == (
        1_495_000,
        1_345_000,
        1_345_000,
        10,
    )
    assert data["min_price"] == 1_345_000

    data = api.get(f"{LIST}{quote(catalog['tests_book'].slug)}/").json()
    placement = data["kit_placements"][0]
    assert set(placement) == {"exam_type", "subject", "order", "is_essential"}
    assert placement["exam_type"]["slug"] == "کانون-وکلا"
    assert placement["order"] == 1 and placement["is_essential"] is True


def test_detail_unencoded_persian_path(client, catalog):
    response = client.get("/api/v1/catalog/books/حقوق-مدنی-دوجلدی/")
    assert response.status_code == 200


def test_detail_404(api, catalog):
    response = api.get(f"{LIST}{quote('ناموجود')}/")
    assert response.status_code == 404
    assert set(response.json()) == {"detail"}
    response = api.get(f"{LIST}{quote(catalog['inactive'].slug)}/")
    assert response.status_code == 404


def test_related(api, catalog):
    url = f"{LIST}{quote(catalog['tests_book'].slug)}/related/"
    data = api.get(url).json()
    assert [b["title"] for b in data] == [QUICK]
    assert set(data[0]) == BOOK_CARD_KEYS
    assert api.get(f"{LIST}nope/related/").status_code == 404


def test_subjects(api, catalog):
    data = api.get("/api/v1/catalog/subjects/").json()
    assert [s["name"] for s in data] == ["حقوق مدنی", "حقوق تجارت", "متون فقه"]
    assert set(data[0]) == SUBJECT_KEYS | {"book_count"}
    assert data[0]["book_count"] == 1  # inactive book not counted
    assert data[2]["book_count"] == 2


def test_exam_types(api, catalog):
    data = api.get("/api/v1/catalog/exam-types/").json()
    assert [e["short_name"] for e in data] == ["کانون", "مرکز"]
    assert set(data[0]) == EXAM_TYPE_KEYS


def test_categories_tree_and_detail(api, catalog):
    data = api.get("/api/v1/catalog/categories/").json()
    assert [c["name"] for c in data] == ["آزمون وکالت", "سریع‌خوان"]
    assert data[0]["children"] == [
        {"id": catalog["bar_civil"].id, "name": "مدنی وکالت", "slug": "مدنی-وکالت", "children": []}
    ]
    detail = api.get(f"/api/v1/catalog/categories/{quote('مدنی-وکالت')}/").json()
    assert set(detail) == {"id", "name", "slug", "children", "description", "parent"}
    assert detail["parent"] == {
        "id": catalog["bar"].id,
        "name": "آزمون وکالت",
        "slug": "آزمون-وکالت",
    }
    root = api.get(f"/api/v1/catalog/categories/{quote('آزمون-وکالت')}/").json()
    assert root["parent"] is None and len(root["children"]) == 1
    assert api.get("/api/v1/catalog/categories/nope/").status_code == 404


def test_exam_events_upcoming_only(api, catalog):
    data = api.get("/api/v1/catalog/exam-events/").json()
    assert [e["name"] for e in data] == ["آزمون کانون وکلا ۱۴۰۵"]
    assert set(data[0]) == {"id", "name", "date", "exam_type"}
    assert data[0]["date"] == "2099-11-05"


def test_study_kits(api, catalog):
    data = api.get("/api/v1/catalog/study-kits/", {"exam_type": "کانون-وکلا"}).json()
    assert len(data) == 1
    kit = data[0]
    assert set(kit) == {"exam_type", "subject", "note", "items"}
    assert [i["order"] for i in kit["items"]] == [1, 2]
    item = kit["items"][0]
    assert set(item) == {"order", "is_essential", "book"}
    assert set(item["book"]) == BOOK_CARD_KEYS | {"variants"}
    assert set(item["book"]["variants"][0]) == VARIANT_KEYS
    assert api.get("/api/v1/catalog/study-kits/", {"exam_type": "مرکز-وکلا"}).json() == []
    assert api.get("/api/v1/catalog/study-kits/", {"subject": "حقوق-مدنی"}).json() == []
    assert (
        len(api.get("/api/v1/catalog/study-kits/", {"subject": "متون-فقه,حقوق-مدنی"}).json()) == 1
    )
