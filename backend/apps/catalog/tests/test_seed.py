"""``manage.py seed_catalog`` loads the real catalogue from ``seed_catalogue.json``.

Expected numbers are read from the JSON files wherever reasonable, so updating the data does not
break the tests.
"""

import datetime as dt
from urllib.parse import quote

import jdatetime
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog import seed_data
from apps.catalog.models import (
    Book,
    BookVariant,
    Category,
    ExamEvent,
    ExamType,
    Person,
    Publisher,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.catalog.services.legacy_import import old_slug
from apps.content.models import Banner, GuideVideo

pytestmark = pytest.mark.django_db

RECORDS = seed_data.load_catalogue()
BY_ID = {r["old_id"]: r for r in RECORDS}
OLD_CATEGORIES = [
    c
    for c in seed_data.load_old_categories()
    if c.get("slug") and c["slug"] not in seed_data.SKIPPED_CATEGORIES
]


def snapshot():
    models = [
        Book, BookVariant, Category, ExamEvent, ExamType, Person, Publisher, StudyKitItem,
        StudyKitRecommendation, Subject, Banner, GuideVideo,
    ]  # fmt: skip
    counts = {m.__name__: m.objects.count() for m in models}
    counts["prices"] = sorted(BookVariant.objects.values_list("book__slug", "price", "stock"))
    return counts


@pytest.fixture
def seeded(db):
    call_command("seed_catalog")


def test_data_files_shape():
    assert len(RECORDS) == 78
    assert sum(1 for r in RECORDS if r["in_stock"]) == 42
    assert len({old_slug(r) for r in RECORDS}) == len(RECORDS)


def test_seed_is_idempotent():
    call_command("seed_catalog")
    first = snapshot()
    call_command("seed_catalog")
    assert snapshot() == first
    assert first["Book"] == len(RECORDS)
    assert first["BookVariant"] == len(RECORDS)  # one PRINT variant per book
    assert first["Category"] == len(OLD_CATEGORIES)
    assert first["ExamType"] == 5
    assert first["Subject"] == 10
    assert first["Banner"] == 2
    assert first["GuideVideo"] == 3


def test_seed_counts(seeded):
    books = Book.objects.filter(is_active=True)
    assert books.count() == len(RECORDS)
    assert set(books.values_list("slug", flat=True)) == {old_slug(r) for r in RECORDS}
    in_stock = books.filter(variants__stock__gt=0).distinct().count()
    assert in_stock == sum(1 for r in RECORDS if r["in_stock"]) == 42
    assert set(BookVariant.objects.values_list("type", flat=True)) == {"PRINT"}
    assert not BookVariant.objects.filter(price_is_placeholder=True).exists()
    assert not books.filter(season_sales_count__gt=0).exists()


@pytest.mark.parametrize(
    ("old_id", "slug"),
    [
        (11, "آیین-دادرسی-مدنی-45370"),
        (58, "Exam-Oriented-Principles-of-Islamic-Jurisprudence"),
        (1, "صفر-تا-صد-متون-فقه"),
    ],
)
def test_old_slugs_are_preserved(seeded, old_id, slug):
    record = BY_ID[old_id]
    book = Book.objects.get(slug=slug)
    assert book.title == record["title"]
    assert book.legacy_path == f"/product/{slug}"
    assert record["old_url_encoded"] == "/product/" + quote(slug)
    response = APIClient().get(f"/api/v1/catalog/books/{quote(slug)}/")
    assert response.status_code == 200
    assert response.json()["slug"] == slug


def test_book_fields_mapped(seeded):
    record = BY_ID[6]
    book = Book.objects.get(slug=old_slug(record))
    assert [a.name for a in book.authors.order_by("id")] == record["authors"]
    assert book.publisher.name == record["publisher"]
    assert book.edition == record["edition"]
    assert book.publish_year == record["publish_year"]
    assert book.pages == record["pages"] and book.isbn == record["isbn"]
    assert {s.name for s in book.subjects.all()} == set(record["subjects"])
    assert {e.name for e in book.exam_types.all()} == set(record["exam_types"])
    assert {c.slug for c in book.categories.all()} == set(record["categories"])
    assert book.cover_source_url == record["cover_url"]
    unknown = Book.objects.get(slug=old_slug(BY_ID[14]))
    assert BY_ID[14]["publisher"] is None and unknown.publisher is None
    # People are shared by normalised name.
    assert Person.objects.filter(name="محسن سینجلی").count() == 1


def test_variant_stock_and_sale(seeded):
    for record in RECORDS:
        variant = BookVariant.objects.get(book__slug=old_slug(record))
        assert variant.stock == (record["stock"] or 10 if record["in_stock"] else 0)
    discounted = BookVariant.objects.get(book__slug=old_slug(BY_ID[86]))
    assert (discounted.price, discounted.sale_price) == (1_880_000, 1_700_000)


def test_price_policy_uses_higher_market_price(seeded):
    raised = {r["old_id"] for r in RECORDS if r["market_price"] and r["market_price"] > r["price"]}
    assert 17 in raised
    for record in RECORDS:
        variant = BookVariant.objects.get(book__slug=old_slug(record))
        if record["old_id"] in raised:
            assert variant.price == record["market_price"]
            assert "nashrechatredanesh.com" in variant.price_note
            assert "۱۴۰۵/۰۷/۱۰" in variant.price_note
        else:
            assert variant.price == record["price"]
            assert variant.price_note.startswith("قیمت سایت قبلی")
    assert BookVariant.objects.get(book__slug="مجموع-قوانین-و-مقررات-آزمون-وکالت").price == (
        1_100_000
    )


def test_descriptions_are_rewritten(seeded):
    for book in Book.objects.exclude(description=""):
        assert 'src="/uploads' not in book.description
        assert "hovalvakil" not in book.description
        assert "<iframe" not in book.description
    book = Book.objects.get(slug="صفر-تا-صد-متون-فقه")
    assert BY_ID[1]["description_image_urls"][0] in book.description
    assert "<img " in book.description
    assert 'href="/product/' in book.description
    arabic = Book.objects.get(slug=old_slug(BY_ID[43]))
    assert "دکتر محمد علی معیر محمدی" in arabic.description  # link text kept


def test_resource_types(seeded):
    def rtype(old_id):
        return Book.objects.get(slug=old_slug(BY_ID[old_id])).resource_type

    assert rtype(3) == "TESTS"  # ۱۱۰۰ تست برگزیده
    assert rtype(17) == "LAWS"  # مجموعه قوانین
    assert rtype(34) == "LAWS"  # قانون مدنی تحریری
    assert rtype(6) == "TEXTBOOK"
    quick = Book.objects.filter(resource_type="QUICK_REVIEW")
    assert quick.count() == sum(1 for r in RECORDS if r["is_quick_review"]) == 5
    assert all(b.is_quick_review for b in quick)


def test_sales_order_in_stock_first(seeded):
    in_stock = {old_slug(r) for r in RECORDS if r["in_stock"]}
    ordered = list(Book.objects.order_by("-sales_count").values_list("slug", flat=True))
    assert set(ordered[: len(in_stock)]) == in_stock
    first_in_stock = next(old_slug(r) for r in RECORDS if r["in_stock"])
    assert ordered[0] == first_in_stock


def test_category_tree(seeded):
    cats = {c.slug: c for c in Category.objects.select_related("parent")}
    assert set(cats) == {c["slug"] for c in OLD_CATEGORIES}
    assert "دوره-های-آموزشی" not in cats
    for c in OLD_CATEGORIES:
        assert cats[c["slug"]].name == c["title"]
    for child in ("حقوق-تجارت", "حقوق-جزا", "آیین-دادرسی-کیفری", "فقه", "حقوق-مدنی-7710a"):
        assert cats[child].parent.slug == "آزمون-وکالت"
    assert cats["حقوق-خصوصی"].parent.slug == "ارشد-و-دکتری"
    assert cats["جزا-و-جرم-شناسی"].parent.slug == "ارشد-و-دکتری"
    assert cats["قضاوت"].parent.slug == "قضاوت-836ca"
    roots = list(Category.objects.filter(parent=None).values_list("slug", flat=True))
    assert roots[:3] == ["آزمون-وکالت", "ارشد-و-دکتری", "سریع-خوان"]
    quick = cats["سریع-خوان"]
    assert quick.books.count() == 5


def test_demo_leftovers_are_deactivated():
    demo_only = Book.objects.create(title="سریع‌خوان جزای عمومی", slug="سریع-خوان-جزای-عمومی")
    overlap = Book.objects.create(title="حقوق مدنی دوجلدی", slug="حقوق-مدنی-دوجلدی-دکتر-شکری")
    BookVariant.objects.create(book=overlap, type="EBOOK", price=1, price_is_placeholder=True)
    demo_cat = Category.objects.create(name="حقوق عمومی", slug="حقوق-عمومی")

    call_command("seed_catalog")
    call_command("seed_catalog")

    demo_only.refresh_from_db()
    overlap.refresh_from_db()
    demo_cat.refresh_from_db()
    assert not demo_only.is_active
    assert not demo_cat.is_active
    assert overlap.is_active and overlap.legacy_path == "/product/حقوق-مدنی-دوجلدی-دکتر-شکری"
    assert [v.type for v in overlap.variants.all()] == ["PRINT"]
    assert Book.objects.filter(is_active=True).count() == len(RECORDS)


def test_study_kits(seeded):
    kits = StudyKitRecommendation.objects.filter(is_active=True)
    assert kits.exists()
    for kit in kits:
        items = list(kit.items.select_related("book").order_by("order"))
        assert 1 <= len(items) <= seed_data.KIT_MAX_ITEMS
        for item in items:
            in_stock = item.book.variants.filter(stock__gt=0).exists()
            assert item.is_essential == (in_stock and item.book.resource_type == "TEXTBOOK")
        flags = [i.is_essential for i in items]
        assert flags == sorted(flags, reverse=True)  # essentials first

    kanoon = {r.subject.name: r.weight for r in kits.filter(exam_type__name="کانون وکلا")}
    expected = seed_data.SUBJECT_WEIGHTS["کانون وکلا"]
    assert {name: kanoon[name] for name in expected} == expected
    assert set(kits.filter(exam_type__name="مرکز وکلا").values_list("weight", flat=True)) == {None}


def test_related_course_on_civil_law_books(seeded):
    civil = Book.objects.filter(subjects__name="حقوق مدنی")
    assert civil.count() == sum(1 for r in RECORDS if "حقوق مدنی" in r["subjects"])
    assert all(b.related_courses.get().price == 8_125_000 for b in civil)
    assert not Book.objects.exclude(subjects__name="حقوق مدنی").filter(
        related_courses__isnull=False
    )
    assert Banner.objects.get(placement="HERO").link_url == "/kit"


def test_exam_event_dates():
    for _name, _type, (y, m, d), expected in seed_data.EXAM_EVENTS:
        assert jdatetime.date(y, m, d).togregorian() == expected
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


def test_search_on_seeded_data(seeded):
    from apps.catalog.services.search import search_books

    quick = set(Book.objects.filter(is_quick_review=True))
    assert quick <= set(search_books(Book.objects.all(), "سريع خوان"))
    assert search_books(Book.objects.all(), "شب خیز").count() == 1
    assert search_books(Book.objects.all(), "شبخیز").count() == 1


def test_seed_if_empty_keeps_admin_edits(db):
    from django.core.management import call_command

    from apps.catalog.models import BookVariant

    call_command("seed_catalog")
    variant = BookVariant.objects.order_by("id").first()
    variant.price = 123_000
    variant.save()
    call_command("seed_catalog", "--if-empty")
    variant.refresh_from_db()
    assert variant.price == 123_000
