import pytest

from apps.catalog.services.home import get_home_data
from apps.content.models import Banner, GuideVideo

pytestmark = pytest.mark.django_db

HOME_KEYS = {
    "next_exam", "exam_types", "subjects", "categories", "hero_banners", "course_banners",
    "bestsellers", "quick_review", "featured_course", "guide_videos",
    "selected_exam_type", "store",  # added after research
    "discounted", "testimonials",  # added in the UI refresh
}  # fmt: skip


@pytest.fixture
def content(catalog):
    Banner.objects.create(placement="HERO", title="هیرو", link_url="/kit", link_label="ساخت")
    Banner.objects.create(placement="COURSE", title="دوره", link_url="https://dadrose.com/")
    Banner.objects.create(placement="HERO", title="غیرفعال", is_active=False)
    for i in range(8):
        GuideVideo.objects.create(
            title=f"ویدیو {i}", video_url="https://dadrose.com/", subject=catalog["civil"]
        )
    return catalog


def test_home_service(content):
    data = get_home_data()
    assert data["next_exam"].name == "آزمون کانون وکلا ۱۴۰۵"
    assert [b.title for b in data["bestsellers"]][:2] == [
        "حقوق مدنی دوجلدی",
        "درسنامه جامع حقوق تجارت",
    ]
    assert "کتاب غیرفعال" not in [b.title for b in data["bestsellers"]]
    assert all(b.has_stock for b in data["bestsellers"])
    assert [b.title for b in data["quick_review"]] == ["سریع‌خوان متون فقه مرکز وکلا"]
    assert [b.title for b in data["hero_banners"]] == ["هیرو"]
    assert [b.title for b in data["course_banners"]] == ["دوره"]
    assert data["featured_course"].title == "دوره جامع حقوق مدنی ۱ تا ۸"
    assert len(data["guide_videos"]) == 6


def test_home_service_empty(db):
    data = get_home_data()
    assert data["next_exam"] is None
    assert data["featured_course"] is None
    assert data["bestsellers"] == []


def test_home_endpoint_shape(api, content):
    response = api.get("/api/v1/catalog/home/")
    assert response.status_code == 200
    data = response.json()
    assert set(data) == HOME_KEYS
    assert set(data["next_exam"]) == {"id", "name", "date", "exam_type"}
    assert set(data["subjects"][0]) == {"id", "name", "slug", "color", "book_count", "weight"}
    assert set(data["categories"][0]) == {"id", "name", "slug", "children"}
    assert set(data["hero_banners"][0]) == {
        "id", "title", "subtitle", "image", "link_url", "link_label",
    }  # fmt: skip
    from .test_api import COURSE_KEYS

    assert set(data["featured_course"]) == COURSE_KEYS
    video = data["guide_videos"][0]
    assert set(video) == {"id", "title", "video_url", "thumbnail", "subject", "exam_type"}
    assert video["exam_type"] is None and video["subject"]["slug"] == "حقوق-مدنی"
    assert len(data["bestsellers"]) == 3  # the out-of-stock quick-review book is excluded


def test_home_endpoint_query_count(api, content):
    from django.core.cache import cache
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    cache.clear()
    with CaptureQueriesContext(connection) as ctx:
        api.get("/api/v1/catalog/home/")
    # +6 in the UI refresh: the discounted rail (1 + 4 prefetches) and the testimonials strip
    assert len(ctx.captured_queries) <= 26, len(ctx.captured_queries)
