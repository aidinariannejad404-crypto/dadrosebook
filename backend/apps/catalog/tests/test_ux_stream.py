"""ux stream: ج۳ search zero state, ج۵ exam calendar (.ics + Google link), ج۷ ebook formats."""

import datetime as dt
from urllib.parse import parse_qs, urlsplit

import pytest
from django.core.cache import cache
from django.core.files.base import ContentFile

from apps.catalog.models import ExamEvent, ExamType, StudyKitRecommendation, Subject
from apps.catalog.services import exam_calendar
from apps.catalog.services.search_zero_state import search_zero_state

from .conftest import make_book, print_variant

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def exam():
    return ExamType.objects.create(name="کانون وکلا", short_name="کانون")


@pytest.fixture
def event(exam):
    return ExamEvent.objects.create(
        name="آزمون وکالت کانون ۱۴۰۵", exam_type=exam, date=dt.date(2026, 11, 5)
    )


# --- ج۵ ----------------------------------------------------------------------------------------


def test_jalali_long_date():
    assert exam_calendar.format_jalali_date(dt.date(2026, 11, 5)) == "پنجشنبه ۱۴ آبان ۱۴۰۵"


def test_ics_exam_day_is_all_day_with_persian_text(event, settings):
    settings.SITE_URL = "https://dadrosebook.com"
    now = dt.datetime(2026, 10, 1, 8, 0, tzinfo=dt.UTC)
    ics = exam_calendar.build_ics(event, "exam", now=now)
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "DTSTART;VALUE=DATE:20261105\r\n" in ics
    assert "DTEND;VALUE=DATE:20261106\r\n" in ics
    assert "DTSTAMP:20261001T080000Z" in ics
    assert "TRIGGER:-P7D" in ics
    unfolded = ics.replace("\r\n ", "")
    assert "SUMMARY:آزمون وکالت کانون ۱۴۰۵" in unfolded
    assert "۱۴ آبان ۱۴۰۵" in unfolded
    assert "/kit?exam=" in unfolded
    # every physical line is at most 75 octets
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))


def test_ics_escapes_text():
    assert exam_calendar._escape("a,b;c\nd\\") == "a\\,b\\;c\\nd\\\\"


def test_registration_window(event):
    with pytest.raises(exam_calendar.NoRegistrationWindow):
        exam_calendar.build_ics(event, "registration")
    assert exam_calendar.calendar_links(event)["registration"] is None
    event.registration_start = dt.date(2026, 8, 23)
    event.registration_end = dt.date(2026, 9, 1)
    ics = exam_calendar.build_ics(event, "registration")
    assert "DTSTART;VALUE=DATE:20260823" in ics and "DTEND;VALUE=DATE:20260902" in ics
    assert "SUMMARY:ثبت‌نام آزمون" in ics.replace("\r\n ", "")


def test_google_link(event):
    url = exam_calendar.google_calendar_url(event)
    parts = urlsplit(url)
    assert parts.netloc == "calendar.google.com"
    q = parse_qs(parts.query)
    assert q["action"] == ["TEMPLATE"]
    assert q["dates"] == ["20261105/20261106"]
    assert q["text"] == [event.name]


def test_ics_endpoint(api, event):
    res = api.get(f"/api/v1/catalog/exam-events/{event.pk}/calendar.ics")
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/calendar")
    assert "attachment" in res["Content-Disposition"]
    assert b"BEGIN:VEVENT" in res.content
    assert (
        api.get(
            f"/api/v1/catalog/exam-events/{event.pk}/calendar.ics?kind=registration"
        ).status_code
        == 404
    )
    assert api.get("/api/v1/catalog/exam-events/9999/calendar.ics").status_code == 404


def test_exam_events_api_exposes_calendar(api, exam):
    ExamEvent.objects.create(
        name="آزمون",
        exam_type=exam,
        date=dt.date.today() + dt.timedelta(days=30),
        registration_start=dt.date.today(),
        registration_end=dt.date.today() + dt.timedelta(days=5),
    )
    row = api.get("/api/v1/catalog/exam-events/").json()[0]
    assert row["registration_start"] and row["registration_end"]
    assert row["calendar"]["exam"]["google"].startswith("https://calendar.google.com/")
    assert row["calendar"]["registration"]["google"]


# --- ج۳ ----------------------------------------------------------------------------------------


def test_zero_state_popular_by_exam_and_kit_subjects(api, exam):
    other = ExamType.objects.create(name="قضاوت", short_name="قضاوت")
    civil = Subject.objects.create(name="مدنی", color="#111111", order=0)
    crim = Subject.objects.create(name="جزا", color="#222222", order=1)
    make_book("الف", subjects=[civil], exam_types=[exam], sales_count=5)
    make_book("ب", subjects=[civil], exam_types=[exam], sales_count=50)
    make_book("ج", subjects=[crim], exam_types=[other], sales_count=500)
    StudyKitRecommendation.objects.create(exam_type=exam, subject=civil, weight=3)

    data = search_zero_state(exam.slug)
    assert [b.title for b in data["popular"]] == ["ب", "الف"]
    assert [s.name for s in data["subjects"]] == ["مدنی"]

    res = api.get("/api/v1/catalog/search/zero-state/", {"exam": exam.slug}).json()
    assert res["exam"]["slug"] == exam.slug
    assert [b["title"] for b in res["popular"]] == ["ب", "الف"]
    assert set(res["popular"][0]) == {"id", "slug", "title"}

    anon = api.get("/api/v1/catalog/search/zero-state/").json()
    assert anon["exam"] is None
    assert anon["popular"][0]["title"] == "ج"
    assert {s["name"] for s in anon["subjects"]} == {"مدنی", "جزا"}


# --- ج۷ ----------------------------------------------------------------------------------------


def test_book_detail_ebook_formats(api, settings, tmp_path):
    from apps.library.models import EbookFile

    settings.PRIVATE_MEDIA_ROOT = str(tmp_path)
    book = make_book("کتاب", variants=[print_variant(100_000)])
    assert api.get(f"/api/v1/catalog/books/{book.slug}/").json()["ebook_formats"] == []
    EbookFile.objects.create(book=book, format="PDF", file=ContentFile(b"%PDF", name="a.pdf"))
    EbookFile.objects.create(book=book, format="EPUB", file=ContentFile(b"PK", name="a.epub"))
    assert api.get(f"/api/v1/catalog/books/{book.slug}/").json()["ebook_formats"] == ["EPUB", "PDF"]
