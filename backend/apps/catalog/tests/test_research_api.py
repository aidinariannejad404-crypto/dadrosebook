"""API behaviour added after the competitor research (P1-*)."""

import datetime as dt
from urllib.parse import quote

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.catalog.models import Book, BookSamplePage, ExamEvent, StudyKitRecommendation
from apps.core.jalali import jalali_year
from apps.core.money import to_persian_digits

from .conftest import make_book, print_variant

pytestmark = pytest.mark.django_db

LIST = "/api/v1/catalog/books/"
HOME = "/api/v1/catalog/home/"
CIVIL = "حقوق مدنی دوجلدی"
COMMERCE = "درسنامه جامع حقوق تجارت"
TESTS = "۱۱۰۰ تست برگزیده متون فقه"
QUICK = "سریع‌خوان متون فقه مرکز وکلا"
KANOON = "کانون-وکلا"
MARKAZ = "مرکز-وکلا"


def cards(api, url=LIST, **params):
    response = api.get(url, params)
    assert response.status_code == 200, response.content
    data = response.json()
    results = data["results"] if isinstance(data, dict) else data
    return {c["title"]: c for c in results}


def detail(api, book, **params):
    response = api.get(f"{LIST}{quote(book.slug)}/", params)
    assert response.status_code == 200, response.content
    return response.json()


# --- P1-17 placeholder prices -------------------------------------------------------------------
def test_placeholder_only_book_has_no_card_price(api, catalog):
    quick = cards(api)[QUICK]
    assert quick["min_price"] is None
    assert quick["card_price"] is None and quick["card_format"] is None
    assert quick["formats"] == ["PRINT"]  # the format still exists, priced «به‌زودی»


def test_placeholder_variants_ignored_in_card_price(api, catalog):
    book = make_book(
        "ترکیبی",
        variants=[
            print_variant(800_000, price_is_placeholder=True),
            {"type": "EBOOK", "price": 300_000},
        ],
    )
    card = cards(api)[book.title]
    assert (card["card_price"], card["card_format"], card["min_price"]) == (
        300_000,
        "EBOOK",
        300_000,
    )
    titles = list(cards(api, max_price=300_000))
    assert book.title in titles
    assert book.title not in cards(api, min_price=700_000)


# --- P1-11 resource type ------------------------------------------------------------------------
def test_resource_type_on_card_and_filter(api, catalog):
    Book.objects.filter(pk=catalog["tests_book"].pk).update(resource_type="TESTS")
    all_cards = cards(api)
    assert all_cards[TESTS]["resource_type"] == "TESTS"
    assert all_cards[TESTS]["resource_type_label"] == "تست و مجموعه سؤالات"
    assert all_cards[QUICK]["resource_type"] == "QUICK_REVIEW"
    assert all_cards[QUICK]["resource_type_label"] == "سریع‌خوان"
    assert all_cards[CIVIL]["resource_type"] == "TEXTBOOK"
    assert set(cards(api, resource_type="TESTS")) == {TESTS}
    assert set(cards(api, resource_type="tests,quick_review")) == {TESTS, QUICK}
    assert len(cards(api, resource_type="bogus")) == 4  # unknown values are ignored


# --- P1-4 samples -------------------------------------------------------------------------------
def test_has_sample_card_and_filter(api, catalog):
    assert cards(api)[CIVIL]["has_sample"] is False
    assert cards(api, has_sample="true") == {}
    BookSamplePage.objects.create(book=catalog["civil_book"], image="samples/pages/1.jpg")
    Book.objects.filter(pk=catalog["commerce_book"].pk).update(sample_pdf="samples/a.pdf")
    result = cards(api, has_sample="true")
    assert set(result) == {CIVIL, COMMERCE}
    assert all(c["has_sample"] for c in result.values())
    assert {"code": "sample", "label": "نمونه رایگان", "tone": "neutral"} in result[COMMERCE][
        "badges"
    ]


# --- P1-5 kit role ------------------------------------------------------------------------------
def test_kit_role_needs_one_exam_type(api, catalog):
    plain = cards(api)
    assert {c["kit_role"] for c in plain.values()} == {None}
    kanoon = cards(api, exam_type=KANOON)
    assert kanoon[TESTS]["kit_role"] == "essential"
    assert kanoon[CIVIL]["kit_role"] is None
    assert {"code": "kit_essential", "label": "ضروری کیت", "tone": "success"} in kanoon[TESTS][
        "badges"
    ]
    # QUICK is a markaz book (filtered out by exam_type), but the list without a filter shows it.
    markaz = cards(api, exam_type=MARKAZ)
    assert markaz[TESTS]["kit_role"] is None  # only in the کانون kit
    both = cards(api, exam_type=f"{KANOON},{MARKAZ}")
    assert {c["kit_role"] for c in both.values()} == {None}


def test_kit_role_optional_on_related_and_detail(api, catalog):
    catalog["quick_book"].variants.update(stock=3)  # related books are in stock only
    url = f"{LIST}{quote(catalog['tests_book'].slug)}/related/"
    related = cards(api, url, exam_type=KANOON)
    assert related[QUICK]["kit_role"] == "optional"
    assert cards(api, url)[QUICK]["kit_role"] is None
    assert detail(api, catalog["tests_book"], exam_type=KANOON)["kit_role"] == "essential"


def test_kit_role_in_study_kits(api, catalog):
    data = api.get("/api/v1/catalog/study-kits/", {"exam_type": KANOON}).json()
    roles = [i["book"]["kit_role"] for i in data[0]["items"]]
    assert roles == ["essential", "optional"]


def test_kit_role_ignores_inactive_kits(api, catalog):
    StudyKitRecommendation.objects.update(is_active=False)
    assert cards(api, exam_type=KANOON)[TESTS]["kit_role"] is None


# --- P1-1 edition badge -------------------------------------------------------------------------
def test_edition_badge(api, catalog):
    soon = timezone.localdate() + dt.timedelta(days=20)
    ExamEvent.objects.create(name="نزدیک", exam_type=catalog["kanoon"], date=soon)
    year = jalali_year(soon)
    Book.objects.filter(pk=catalog["civil_book"].pk).update(
        publish_year=year, law_updated_until="اصلاحات ۱۴۰۴"
    )
    Book.objects.filter(pk=catalog["commerce_book"].pk).update(publish_year=year - 1)
    all_cards = cards(api)
    civil = all_cards[CIVIL]
    assert civil["edition_badge"] == f"ویرایش {to_persian_digits(year)}"
    assert civil["law_updated_until"] == "اصلاحات ۱۴۰۴"
    assert civil["badges"][0] == {
        "code": "edition",
        "label": civil["edition_badge"],
        "tone": "primary",
    }
    assert all_cards[COMMERCE]["edition_badge"] is None
    assert all_cards[COMMERCE]["law_updated_until"] == ""


# --- P1-13 / P1-14 / P1-20 ----------------------------------------------------------------------
def test_course_badge_social_proof_and_badges(api, catalog):
    Book.objects.filter(pk=catalog["civil_book"].pk).update(season_sales_count=42)
    Book.objects.filter(pk=catalog["commerce_book"].pk).update(season_sales_count=19)
    Book.objects.filter(pk__in=[catalog["tests_book"].pk, catalog["quick_book"].pk]).update(
        season_sales_count=1
    )
    all_cards = cards(api)
    civil = all_cards[CIVIL]
    assert civil["course_badge"] == "دوره جامع حقوق مدنی ۱ تا ۸"
    assert civil["social_proof"] == {"subject_rank": 1, "season_buyers": 42}
    assert civil["badges"] == [
        {"code": "bestseller", "label": "پرفروش‌ترین #۱ حقوق مدنی", "tone": "accent"},
        {"code": "bundle", "label": "چاپی + الکترونیک", "tone": "info"},
    ]
    assert all_cards[COMMERCE]["course_badge"] is None
    assert all_cards[COMMERCE]["social_proof"] == {"subject_rank": 1, "season_buyers": None}
    assert all_cards[TESTS]["social_proof"]["subject_rank"] == 1
    assert all_cards[QUICK]["social_proof"]["subject_rank"] == 2
    assert [b["code"] for b in all_cards[QUICK]["badges"]] == ["bestseller", "quick_review"]


def test_course_badge_ignores_inactive_course(api, catalog):
    catalog["course"].is_active = False
    catalog["course"].save()
    assert cards(api)[CIVIL]["course_badge"] is None


def test_no_rank_from_editorial_sales_count_alone(api, catalog):
    # Seeded/editorial sales_count orders rails but never produces a "bestseller" claim.
    Book.objects.update(season_sales_count=0)
    assert all(c["social_proof"]["subject_rank"] is None for c in cards(api).values())


def test_no_rank_without_sales(api, catalog):
    book = make_book("بی‌فروش", subjects=[catalog["commerce"]], variants=[print_variant(1)])
    assert cards(api)[book.title]["social_proof"]["subject_rank"] is None


# --- P1-7 / P1-16 detail ------------------------------------------------------------------------
def test_detail_bundle_saving_and_study_days(api, catalog):
    Book.objects.filter(pk=catalog["civil_book"].pk).update(study_days=12)
    data = detail(api, catalog["civil_book"])
    assert data["study_days"] == 12
    savings = {v["type"]: v["bundle_saving"] for v in data["variants"]}
    assert savings == {"PRINT": None, "EBOOK": None, "BUNDLE": 2_200_000 + 990_000 - 2_750_000}

    catalog["civil_book"].variants.filter(type="EBOOK").update(price_is_placeholder=True)
    data = detail(api, catalog["civil_book"])
    assert {v["bundle_saving"] for v in data["variants"]} == {None}
    assert detail(api, catalog["commerce_book"])["study_days"] is None


def test_study_kit_variants_have_bundle_saving(api, catalog):
    data = api.get("/api/v1/catalog/study-kits/", {"exam_type": KANOON}).json()
    variant = data[0]["items"][0]["book"]["variants"][0]
    assert variant["bundle_saving"] is None  # PRINT


# --- P1-8 related in stock ----------------------------------------------------------------------
def test_related_in_stock(api, catalog):
    url = f"{LIST}{quote(catalog['tests_book'].slug)}/related/"
    # related books are always in stock now; ``in_stock=true`` is still accepted
    assert cards(api, url) == {}
    assert cards(api, url, in_stock="true") == {}
    in_stock = make_book(
        "جایگزین موجود", subjects=[catalog["fiqh"]], variants=[print_variant(1, stock=3)]
    )
    assert list(cards(api, url, in_stock="true")) == [in_stock.title]
    assert list(cards(api, url)) == [in_stock.title]


# --- P1-10 weights in study kits ----------------------------------------------------------------
def test_study_kits_weight_and_order(api, catalog):
    rec_fiqh = catalog["rec"]
    rec_civil = StudyKitRecommendation.objects.create(
        exam_type=catalog["kanoon"], subject=catalog["civil"], weight=4
    )
    from apps.catalog.models import StudyKitItem

    StudyKitItem.objects.create(recommendation=rec_civil, book=catalog["civil_book"], order=1)
    rec_fiqh.weight = 1
    rec_fiqh.save()
    data = api.get("/api/v1/catalog/study-kits/", {"exam_type": KANOON}).json()
    assert [(k["subject"]["name"], k["weight"]) for k in data] == [
        ("حقوق مدنی", 4),
        ("متون فقه", 1),
    ]
    rec_civil.weight = None
    rec_civil.save()
    data = api.get("/api/v1/catalog/study-kits/", {"exam_type": KANOON}).json()
    assert [k["weight"] for k in data] == [1, None]  # unweighted last


# --- P1-3 / P1-6 / P1-10 home -------------------------------------------------------------------
def test_home_without_exam_type(api, catalog):
    cache.clear()
    data = api.get(HOME).json()
    assert data["selected_exam_type"] is None
    assert {s["weight"] for s in data["subjects"]} == {None}
    assert data["store"]["print_dispatch_note"] == "ارسال حداکثر ۱ روز کاری پس از سفارش"
    assert {c["kit_role"] for c in data["bestsellers"]} == {None}


def test_home_filtered_by_exam_type(api, catalog):
    cache.clear()
    catalog["rec"].weight = 1
    catalog["rec"].save()
    StudyKitRecommendation.objects.create(
        exam_type=catalog["kanoon"], subject=catalog["civil"], weight=4
    )
    data = api.get(HOME, {"exam_type": KANOON}).json()
    assert data["selected_exam_type"] == {
        "id": catalog["kanoon"].id,
        "name": "کانون وکلا",
        "slug": KANOON,
        "short_name": "کانون",
    }
    assert [b["title"] for b in data["bestsellers"]] == [CIVIL, COMMERCE, TESTS]
    assert data["quick_review"] == []  # the only quick review is a مرکز book
    assert data["next_exam"]["exam_type"]["slug"] == KANOON
    assert [(s["name"], s["weight"]) for s in data["subjects"]] == [
        ("حقوق مدنی", 4),
        ("متون فقه", 1),
        ("حقوق تجارت", None),
    ]
    kit_roles = {b["title"]: b["kit_role"] for b in data["bestsellers"]}
    assert kit_roles[TESTS] == "essential" and kit_roles[CIVIL] is None


def test_home_exam_type_falls_back_to_any_next_exam(api, catalog):
    cache.clear()
    data = api.get(HOME, {"exam_type": MARKAZ}).json()
    assert data["selected_exam_type"]["slug"] == MARKAZ
    assert data["next_exam"]["exam_type"]["slug"] == KANOON  # no مرکز event: unfiltered
    assert [b["title"] for b in data["bestsellers"]] == [CIVIL, TESTS]
    assert [b["title"] for b in data["quick_review"]] == [QUICK]

    later = timezone.localdate() + dt.timedelta(days=400)
    ExamEvent.objects.create(name="آزمون مرکز", exam_type=catalog["markaz"], date=later)
    cache.clear()
    data = api.get(HOME, {"exam_type": MARKAZ}).json()
    assert data["next_exam"]["name"] == "آزمون مرکز"


def test_home_unknown_exam_type_is_ignored(api, catalog):
    cache.clear()
    data = api.get(HOME, {"exam_type": "ناموجود"}).json()
    assert data["selected_exam_type"] is None
    assert len(data["bestsellers"]) == 3


def test_home_cache_is_per_exam_type(api, catalog):
    cache.clear()
    first = api.get(HOME, {"exam_type": KANOON}).json()
    second = api.get(HOME, {"exam_type": MARKAZ}).json()
    plain = api.get(HOME).json()
    assert first["selected_exam_type"]["slug"] == KANOON
    assert second["selected_exam_type"]["slug"] == MARKAZ
    assert plain["selected_exam_type"] is None
    # Served from cache on repeat: a change is not visible until the entry expires.
    Book.objects.filter(pk=catalog["civil_book"].pk).update(is_active=False)
    assert api.get(HOME, {"exam_type": KANOON}).json() == first


def test_home_query_count_with_exam_type(api, catalog):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    cache.clear()
    with CaptureQueriesContext(connection) as ctx:
        api.get(HOME, {"exam_type": KANOON})
    # +6 in the UI refresh: the discounted rail (1 + 4 prefetches) and the testimonials strip
    assert len(ctx.captured_queries) <= 28, len(ctx.captured_queries)


def test_list_query_count_with_exam_type(api, catalog):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    for i in range(10):
        make_book(f"کتاب {i}", subjects=[catalog["civil"]], variants=[print_variant(1)])
    with CaptureQueriesContext(connection) as ctx:
        response = api.get(LIST, {"exam_type": KANOON})
    assert response.status_code == 200
    # count + page + authors + subjects + exam_types + variants + current exam year
    assert len(ctx.captured_queries) <= 7, [q["sql"] for q in ctx.captured_queries]
