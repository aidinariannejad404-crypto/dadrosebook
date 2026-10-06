import datetime as dt
from urllib.parse import quote

import pytest
from django.utils import timezone

from apps.catalog.models import Person
from apps.content.models import CuratedList, CuratedListItem, Guide
from apps.content.services.guides import get_guide, guide_is_indexable, list_is_expired

from .conftest import words

pytestmark = pytest.mark.django_db


@pytest.fixture
def guide(hub_world):
    author = Person.objects.create(name="نویسنده", job_title="وکیل پایه یک")
    reviewer = Person.objects.create(name="بازبین", affiliation="دانشگاه شهید بهشتی")
    g = Guide.objects.create(
        title="بهترین منابع آزمون وکالت ۱۴۰۵",
        summary="خلاصه",
        intro='<p>مقدمه <img src="javascript:x"></p>',
        body="<h2>بخش</h2><p>متن <script>x</script></p>",
        author=author,
        reviewer=reviewer,
        updated_on=dt.date(2026, 10, 1),
    )
    g.exam_types.set([hub_world["exam"]])
    g.books.set(hub_world["books"])
    return g


def test_guide_slug_and_sanitised_html(guide):
    assert guide.slug == "بهترین-منابع-آزمون-وکالت-1405"
    assert "<script>" not in guide.body
    assert "javascript" not in guide.intro
    assert guide.published_at is None


def test_draft_needs_the_preview_key(guide):
    assert get_guide(guide.slug) is None
    assert get_guide(guide.slug, "not-a-uuid") is None
    assert get_guide(guide.slug, str(guide.preview_key)) == guide
    assert not guide_is_indexable(guide)


def test_publishing_sets_published_at(guide):
    guide.status = Guide.Status.PUBLISHED
    guide.save()
    assert guide.published_at is not None
    assert get_guide(guide.slug) == guide
    assert guide_is_indexable(guide)


def test_guide_api(api, guide):
    path = f"/api/v1/content/guides/{quote(guide.slug)}/"
    assert api.get(path).status_code == 404
    preview = api.get(f"{path}?preview={guide.preview_key}")
    assert preview.status_code == 200
    assert "no-store" in preview["Cache-Control"]
    body = preview.json()
    assert body["is_published"] is False and body["indexable"] is False
    assert body["author"]["job_title"] == "وکیل پایه یک"
    assert body["reviewer"]["affiliation"] == "دانشگاه شهید بهشتی"
    assert body["updated_on"] == "2026-10-01"
    assert len(body["books"]) == 3
    assert body["exam_types"][0]["name"] == "کانون وکلا"

    guide.status = Guide.Status.PUBLISHED
    guide.save()
    body = api.get(path).json()
    assert body["indexable"] is True
    assert [g["slug"] for g in api.get("/api/v1/content/guides/").json()] == [guide.slug]


def test_curated_list(api, hub_world):
    curated = CuratedList.objects.create(title="سریع‌خوان‌های ماه آخر", intro=words(150))
    for i, book in enumerate(reversed(hub_world["books"])):
        CuratedListItem.objects.create(curated_list=curated, book=book, order=i, note=f"n{i}")
    path = f"/api/v1/content/lists/{quote(curated.slug)}/"
    body = api.get(path).json()
    assert [e["book"]["title"] for e in body["entries"]] == ["مدنی 2", "مدنی 1", "مدنی 0"]
    assert body["entries"][0]["note"] == "n0"
    assert body["indexable"] is True and body["is_expired"] is False

    curated.ends_on = timezone.localdate() - dt.timedelta(days=1)
    curated.save()
    assert list_is_expired(curated)
    from django.core.cache import cache

    cache.clear()
    body = api.get(path).json()
    assert body["is_expired"] is True and body["indexable"] is False

    curated.is_active = False
    curated.save()
    cache.clear()
    assert api.get(path).status_code == 404


def test_short_list_is_noindex(api, hub_world):
    curated = CuratedList.objects.create(title="کوتاه", intro="<p>کوتاه</p>")
    CuratedListItem.objects.create(curated_list=curated, book=hub_world["tejarat"])
    body = api.get(f"/api/v1/content/lists/{quote(curated.slug)}/").json()
    assert body["indexable"] is False and body["book_count"] == 1
