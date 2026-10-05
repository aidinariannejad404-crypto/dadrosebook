"""UI refresh: card discount/compare price, quick add, ratings, stock-aware rails, testimonials."""

from urllib.parse import quote

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import User
from apps.catalog.models import BookVariant
from apps.catalog.services import home as home_svc
from apps.catalog.services.home import discounted_books, excerpt, get_home_data
from apps.catalog.services.pricing import card_discount, quick_add_variant
from apps.catalog.services.ratings import card_rating
from apps.reviews.models import Review

from .conftest import ebook_variant, make_book, print_variant

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


LIST = "/api/v1/catalog/books/"


def variant(type_="PRINT", price=1_000_000, sale=None, stock=5, placeholder=False):
    return BookVariant(
        type=type_, price=price, sale_price=sale, stock=stock, price_is_placeholder=placeholder
    )


# --- pricing services ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("v", "expected"),
    [
        (None, (None, None)),
        (variant(), (None, None)),
        (variant(sale=800_000), (1_000_000, 20)),
        (variant(sale=1_200_000), (None, None)),  # a higher "sale" is ignored
        (variant(sale=999_000), (None, None)),  # rounds to 0 %
        (variant(sale=800_000, placeholder=True), (None, None)),
    ],
)
def test_card_discount(v, expected):
    result = card_discount(v)
    assert (result["compare_price"], result["discount_percent"]) == expected


def test_quick_add_variant():
    print_ = variant(stock=3)
    ebook = variant("EBOOK", 500_000, stock=0)
    assert quick_add_variant([ebook, print_]) is print_
    # the card shows the (sold-out) print price, so no one-tap add
    assert quick_add_variant([variant(stock=0), ebook]) is None
    assert quick_add_variant([ebook]) is ebook
    assert quick_add_variant([variant(placeholder=True)]) is None
    assert quick_add_variant([]) is None


@pytest.mark.parametrize(
    ("avg", "count", "expected"),
    [
        (None, 0, (None, 0)),
        (4.8, 4, (None, 4)),
        (4.26, 5, (4.3, 5)),
        (5.0, 12, (5.0, 12)),
    ],
)
def test_card_rating(avg, count, expected):
    result = card_rating(avg, count)
    assert (result["rating_avg"], result["rating_count"]) == expected


def test_excerpt():
    assert excerpt("  کتاب   خوبی بود ") == "کتاب خوبی بود"
    long = "واژه " * 100
    cut = excerpt(long, 30)
    assert cut.endswith("…") and len(cut) <= 31 and "  " not in cut


# --- card API -----------------------------------------------------------------------------------
def _reviews(book, ratings, status=Review.Status.APPROVED, start=0, **kw):
    for i, rating in enumerate(ratings, start=start):
        user = User.objects.create_user(phone=f"0912{i:07d}", first_name="کاربر", last_name="تست")
        Review.objects.create(book=book, user=user, rating=rating, status=status, **kw)


def test_card_fields(api, catalog):
    data = {c["title"]: c for c in api.get(LIST).json()["results"]}
    commerce = data["درسنامه جامع حقوق تجارت"]
    assert commerce["card_price"] == 1_345_000
    assert commerce["card_compare_price"] == 1_495_000
    assert commerce["card_discount_percent"] == 10
    civil = data["حقوق مدنی دوجلدی"]
    assert civil["card_compare_price"] is None and civil["card_discount_percent"] is None
    print_id = catalog["civil_book"].variants.get(type="PRINT").id
    assert civil["quick_add_variant_id"] == print_id
    quick = data["سریع‌خوان متون فقه مرکز وکلا"]  # placeholder price, no stock
    assert quick["quick_add_variant_id"] is None
    assert (civil["rating_avg"], civil["rating_count"]) == (None, 0)


def test_card_rating_counts_only_approved(api, catalog):
    book = catalog["civil_book"]
    _reviews(book, [5, 5, 4, 4], start=0)
    _reviews(book, [1, 1], status=Review.Status.PENDING, start=10)
    _reviews(book, [1], status=Review.Status.REJECTED, start=20)
    card = api.get(f"{LIST}{quote(book.slug)}/").json()
    assert (card["rating_avg"], card["rating_count"]) == (None, 4)  # below 5: no average
    _reviews(book, [3], start=30)
    card = api.get(f"{LIST}{quote(book.slug)}/").json()
    assert (card["rating_avg"], card["rating_count"]) == (4.2, 5)


def test_rating_annotation_does_not_multiply_prices(api, catalog):
    _reviews(catalog["commerce_book"], [5, 5, 5, 5, 5, 4])
    card = next(
        c for c in api.get(LIST).json()["results"] if c["title"] == "درسنامه جامع حقوق تجارت"
    )
    assert card["min_price"] == 1_345_000
    assert (card["rating_avg"], card["rating_count"]) == (4.8, 6)


def test_book_list_query_count_unchanged_by_ratings(api, catalog):
    for book in (catalog["civil_book"], catalog["commerce_book"]):
        _reviews(book, [5] * 5, start=book.id * 100)
    with CaptureQueriesContext(connection) as ctx:
        api.get(LIST)
    before = len(ctx.captured_queries)
    for i in range(5):
        make_book(f"کتاب {i}", subjects=[catalog["civil"]], variants=[print_variant(10_000)])
    with CaptureQueriesContext(connection) as ctx:
        api.get(LIST)
    assert len(ctx.captured_queries) == before  # no per-book rating queries


# --- home rails ---------------------------------------------------------------------------------
def test_quick_review_rail_in_stock_first(catalog):
    sold_out = catalog["quick_book"]
    in_stock = make_book(
        "سریع‌خوان موجود",
        subjects=[catalog["civil"]],
        variants=[print_variant(300_000, 4)],
        is_quick_review=True,
        sales_count=1,  # sells less than the sold-out one
    )
    assert [b.title for b in get_home_data()["quick_review"]] == [in_stock.title, sold_out.title]


def test_discounted_rail(catalog):
    assert [b.title for b in discounted_books(catalog["civil_book"].__class__.objects.all())] == [
        "درسنامه جامع حقوق تجارت"
    ]
    # a discount on the ebook only is not the card price: not in the rail
    make_book(
        "تخفیف فقط نسخه الکترونیک",
        subjects=[catalog["civil"]],
        variants=[print_variant(500_000, 3), ebook_variant(300_000, sale_price=200_000)],
    )
    # out of stock: never offered
    make_book(
        "تخفیف ناموجود",
        subjects=[catalog["civil"]],
        variants=[print_variant(500_000, 0, sale_price=250_000)],
    )
    bigger = make_book(
        "تخفیف بزرگ",
        subjects=[catalog["civil"]],
        variants=[print_variant(500_000, 3, sale_price=250_000)],
    )
    titles = [b.title for b in get_home_data()["discounted"]]
    assert titles == [bigger.title, "درسنامه جامع حقوق تجارت"]


def test_testimonials_are_real_approved_reviews(catalog):
    assert home_svc.testimonials() == []  # never faked
    book = catalog["civil_book"]
    _reviews(book, [5], body="خیلی کامل و دقیق بود.", start=0)
    _reviews(book, [5], body="", start=1)  # no text
    _reviews(book, [2], body="خوب نبود", start=2)  # low rating
    _reviews(book, [5], body="منتظر تأیید", status=Review.Status.PENDING, start=3)
    _reviews(
        catalog["commerce_book"], [4], body="برای کانون عالی", start=4, exam_type=catalog["kanoon"]
    )
    assert [r.excerpt for r in home_svc.testimonials()] == [
        "برای کانون عالی",
        "خیلی کامل و دقیق بود.",
    ]
    assert home_svc.testimonials(catalog["kanoon"])[0].excerpt == "برای کانون عالی"


def test_home_endpoint_new_rails(api, catalog):
    _reviews(catalog["civil_book"], [5], body="عالی بود", start=0, is_verified_purchase=True)
    data = api.get("/api/v1/catalog/home/").json()
    assert [b["title"] for b in data["discounted"]] == ["درسنامه جامع حقوق تجارت"]
    assert data["discounted"][0]["card_discount_percent"] == 10
    (t,) = data["testimonials"]
    assert set(t) == {"id", "rating", "body", "author", "is_verified_purchase", "exam_type", "book"}
    assert t["author"] == "کاربر ت." and t["book"]["title"] == "حقوق مدنی دوجلدی"
    assert t["is_verified_purchase"] is True
