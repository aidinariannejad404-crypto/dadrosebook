import datetime as dt

import pytest
from django.core.files.base import ContentFile

from apps.catalog.models import BookVariant, Category, ExamType, Subject
from apps.catalog.tests.conftest import ebook_variant, make_book, print_variant
from apps.seo.services.sitemap import build_sitemap_data, iso_utc

pytestmark = pytest.mark.django_db

URL = "/api/v1/seo/sitemap/"


@pytest.fixture
def world(db):
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C")
    Subject.objects.create(name="درس غیرفعال", color="#000000", is_active=False)
    ExamType.objects.create(name="کانون وکلا")
    ExamType.objects.create(name="آزمون غیرفعال", is_active=False)
    Category.objects.create(name="آزمون وکالت")
    Category.objects.create(name="دسته غیرفعال", is_active=False)
    on_sale = make_book("حقوق مدنی", subjects=[civil], variants=[print_variant(900_000)])
    ebook_only = make_book("کتاب الکترونیک", variants=[ebook_variant(300_000)])
    make_book("بدون نسخه")
    make_book("نسخه غیرفعال", variants=[print_variant(100_000, is_active=False)])
    make_book("کتاب غیرفعال", is_active=False, variants=[print_variant(100_000)])
    return {"on_sale": on_sale, "ebook_only": ebook_only}


def test_only_active_books_with_active_variants(world):
    data = build_sitemap_data()
    assert [b["slug"] for b in data["books"]] == sorted(
        [world["on_sale"].slug, world["ebook_only"].slug]
    )
    assert [c["slug"] for c in data["categories"]] == ["آزمون-وکالت"]
    assert [s["slug"] for s in data["subjects"]] == ["حقوق-مدنی"]
    assert [e["slug"] for e in data["exam_types"]] == ["کانون-وکلا"]


def test_updated_at_is_utc_and_follows_variant_changes(world):
    book = world["on_sale"]
    later = book.updated_at + dt.timedelta(days=3)
    BookVariant.objects.filter(book=book).update(updated_at=later)
    row = next(b for b in build_sitemap_data()["books"] if b["slug"] == book.slug)
    assert row["updated_at"] == iso_utc(later)
    assert row["updated_at"].endswith("Z")
    assert row["cover"] is None


def test_api_shape_and_absolute_cover(api, world):
    book = world["on_sale"]
    book.cover.save("c.jpg", ContentFile(b"jpg"), save=True)
    response = api.get(URL)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"books", "categories", "subjects", "exam_types"}
    row = next(b for b in body["books"] if b["slug"] == book.slug)
    assert set(row) == {"slug", "updated_at", "cover"}
    assert row["cover"].startswith("http://testserver/media/covers/")
    assert set(body["categories"][0]) == {"slug", "updated_at"}


def test_sitemap_is_cached(api, world):
    first = api.get(URL).json()
    make_book("کتاب تازه", variants=[print_variant(1)])
    assert api.get(URL).json() == first
