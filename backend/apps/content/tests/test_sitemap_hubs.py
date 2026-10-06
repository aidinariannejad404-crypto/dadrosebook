import pytest

from apps.content.models import CuratedList, CuratedListItem, Guide
from apps.content.services.sitemap import hub_sitemap_data

from .conftest import words

pytestmark = pytest.mark.django_db


def test_only_indexable_hubs_are_listed(hub_world):
    CuratedList.objects.create(title="کوتاه", intro="<p>کوتاه</p>")
    full = CuratedList.objects.create(title="کامل", intro=words(150))
    for book in hub_world["books"]:
        CuratedListItem.objects.create(curated_list=full, book=book)
    Guide.objects.create(title="پیش‌نویس", body="<p>x</p>")
    Guide.objects.create(title="منتشرشده", body="<p>x</p>", status="PUBLISHED")

    data = hub_sitemap_data()
    assert [e["slug"] for e in data["exam_types"]] == [hub_world["exam"].slug]
    assert data["subjects"] == []  # no intros
    assert [e["slug"] for e in data["authors"]] == [hub_world["author"].slug]  # translator: 1 book
    assert [e["slug"] for e in data["publishers"]] == [hub_world["publisher"].slug]
    assert [e["slug"] for e in data["guides"]] == ["منتشرشده"]
    assert [e["slug"] for e in data["lists"]] == ["کامل"]
    assert data["exam_types"][0]["updated_at"].endswith("Z")


def test_placeholder_exam_intro_is_left_out(hub_world):
    exam = hub_world["exam"]
    exam.intro_is_placeholder = True
    exam.save()
    assert hub_sitemap_data()["exam_types"] == []


def test_lastmod_follows_newest_book(hub_world):
    import datetime as dt

    from apps.catalog.models import Book

    later = hub_world["exam"].updated_at + dt.timedelta(days=5)
    Book.objects.filter(pk=hub_world["tejarat"].pk).update(updated_at=later)
    row = hub_sitemap_data()["exam_types"][0]
    assert row["updated_at"] == later.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
