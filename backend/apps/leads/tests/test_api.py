"""``POST/GET /api/v1/leads/study-plan/`` and the lead admin."""

import datetime as dt
import uuid

import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import (
    ExamEvent,
    ExamType,
    RelatedCourse,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.catalog.tests.conftest import make_book, print_variant
from apps.catalog.tests.test_api import COURSE_KEYS
from apps.leads.models import Lead
from apps.leads.services.leads import hash_ip, mask_phone

pytestmark = pytest.mark.django_db

URL = "/api/v1/leads/study-plan/"
PLAN_KEYS = {
    "token", "created_at", "phone_masked", "exam", "hours_per_day", "summary", "days", "review",
    "recommended_courses",
}  # fmt: skip
T = RelatedCourse.CourseType


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def world(db):
    today = timezone.localdate()
    kanoon = ExamType.objects.create(name="کانون وکلا", short_name="کانون", order=0)
    markaz = ExamType.objects.create(name="مرکز وکلا", short_name="مرکز", order=1)
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)
    criminal = Subject.objects.create(name="حقوق جزا", color="#A23B32", order=3)
    event = ExamEvent.objects.create(
        name="آزمون کانون وکلا ۱۴۰۵", exam_type=kanoon, date=today + dt.timedelta(days=33)
    )
    civil_book = make_book(
        "حقوق مدنی نموداری",
        subjects=[civil],
        exam_types=[kanoon],
        variants=[print_variant(900_000)],
        pages=820,
    )
    criminal_book = make_book(
        "شرح قانون مجازات", subjects=[criminal], exam_types=[kanoon], pages=None
    )
    optional_book = make_book("تست جزا", subjects=[criminal], exam_types=[kanoon], pages=200)
    inactive = make_book("کتاب غیرفعال", subjects=[civil], is_active=False)
    civil_kit = StudyKitRecommendation.objects.create(exam_type=kanoon, subject=civil, weight=4)
    criminal_kit = StudyKitRecommendation.objects.create(
        exam_type=kanoon, subject=criminal, weight=3
    )
    StudyKitItem.objects.create(recommendation=civil_kit, book=civil_book, is_essential=True)
    StudyKitItem.objects.create(
        recommendation=criminal_kit, book=criminal_book, order=1, is_essential=True
    )
    StudyKitItem.objects.create(
        recommendation=criminal_kit, book=optional_book, order=2, is_essential=False
    )

    def course(title, course_type, subject, students=None, exam_types=(kanoon, markaz), **kw):
        c = RelatedCourse.objects.create(
            title=title,
            url=f"https://dadrose.com/courses/{uuid.uuid4().hex}/",
            course_type=course_type,
            subject=subject,
            price=kw.pop("price", 1_000_000),
            students_count=students,
            **kw,
        )
        c.exam_types.set(exam_types)
        return c

    courses = {
        "civil_full": course("جامع مدنی", T.FULL, civil, 283),
        "civil_ess": course("امهات مدنی", T.ESSENTIALS, civil, 588),
        "civil_ess_markaz": course("امهات مدنی مرکز", T.ESSENTIALS, civil, 900, (markaz,)),
        "civil_tips": course("نکته و تست مدنی", T.TIPS_TESTS, civil, 318),
        "criminal_ess": course("امهات جزا", T.ESSENTIALS, criminal, 500),
        "criminal_review": course(
            "تحلیل سوالات جزا", T.REVIEW, criminal, 205, price=0, is_free=True
        ),
        "archived": course(
            "امهات قدیمی", T.ESSENTIALS, civil, 999, status=RelatedCourse.Status.ARCHIVED
        ),
    }
    return {
        "today": today,
        "kanoon": kanoon,
        "markaz": markaz,
        "civil": civil,
        "criminal": criminal,
        "event": event,
        "civil_book": civil_book,
        "criminal_book": criminal_book,
        "optional_book": optional_book,
        "inactive": inactive,
        "courses": courses,
    }


def body(world, **overrides):
    data = {
        "phone": "09121234567",
        "exam_type": world["kanoon"].slug,
        "subjects": [world["civil"].slug],
        "books": [world["civil_book"].slug],
        "hours_per_day": 6,
        "consent": True,
    }
    data.update(overrides)
    return data


def post(api, data, **extra):
    return api.post(URL, data, format="json", **extra)


# --- POST --------------------------------------------------------------------------------------
def test_create_returns_token_and_plan_url(api, world):
    response = post(
        api,
        body(world, phone="۰۹۱۲ ۱۲۳ ۴۵۶۷"),
        HTTP_USER_AGENT="Mozilla/5.0 " + "x" * 400,
        REMOTE_ADDR="5.6.7.8",
    )
    assert response.status_code == 201, response.content
    data = response.json()
    assert set(data) == {"token", "plan_url"}
    assert data["plan_url"] == f"/plan/{data['token']}"
    lead = Lead.objects.get(token=data["token"])
    assert lead.phone == "09121234567"
    assert lead.consent is True and lead.source == "study_plan"
    assert lead.exam_type == world["kanoon"]
    assert list(lead.subjects.all()) == [world["civil"]]
    assert list(lead.books.all()) == [world["civil_book"]]
    assert lead.hours_per_day == 6
    assert lead.ip_hash == hash_ip("5.6.7.8") and "5.6.7.8" not in lead.ip_hash
    assert len(lead.user_agent) == 200
    assert lead.plan["summary"]["total_pages"] == 820


@pytest.mark.parametrize("phone", ["+989121234567", "00989121234567", "9121234567"])
def test_phone_is_normalised(api, world, phone):
    response = post(api, body(world, phone=phone))
    assert response.status_code == 201
    assert Lead.objects.get().phone == "09121234567"


@pytest.mark.parametrize("phone", ["0912123456", "08121234567", "abc", "", "091212345678"])
def test_invalid_phone(api, world, phone):
    response = post(api, body(world, phone=phone))
    assert response.status_code == 400
    assert "phone" in response.json()
    assert not Lead.objects.exists()


def test_invalid_phone_message_is_persian(api, world):
    response = post(api, body(world, phone="0812"))
    assert response.json()["phone"] == ["شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود."]


@pytest.mark.parametrize("consent", [False, None, "missing"])
def test_consent_is_required(api, world, consent):
    data = body(world)
    if consent == "missing":
        del data["consent"]
    else:
        data["consent"] = consent
    response = post(api, data)
    assert response.status_code == 400
    assert list(response.json()) == ["consent"]
    assert not Lead.objects.exists()


def test_books_must_exist_and_be_active(api, world):
    response = post(api, body(world, books=["کتاب-ناموجود", world["inactive"].slug]))
    assert response.status_code == 400
    message = response.json()["books"][0]
    assert "کتاب-ناموجود" in message and world["inactive"].slug in message


def test_unknown_exam_type_and_subject(api, world):
    response = post(api, body(world, exam_type="ناموجود", subjects=["ناموجود"]))
    assert response.status_code == 400
    assert set(response.json()) == {"exam_type", "subjects"}


def test_books_or_subjects_required(api, world):
    response = post(api, body(world, books=[], subjects=[]))
    assert response.status_code == 400
    assert list(response.json()) == ["books"]


@pytest.mark.parametrize("hours", [0, 17, "زیاد"])
def test_hours_per_day_range(api, world, hours):
    response = post(api, body(world, hours_per_day=hours))
    assert response.status_code == 400
    assert list(response.json()) == ["hours_per_day"]


def test_without_books_the_kit_essentials_are_used(api, world):
    response = post(
        api, body(world, books=[], subjects=[world["civil"].slug, world["criminal"].slug])
    )
    assert response.status_code == 201
    lead = Lead.objects.get()
    assert set(lead.books.all()) == {world["civil_book"], world["criminal_book"]}  # no optional
    assert lead.plan["summary"]["total_pages"] == 820 + 300  # null pages → 300


def test_throttled_after_ten_posts_per_hour(api, world):
    for _ in range(10):
        assert post(api, body(world)).status_code == 201
    response = post(api, body(world))
    assert response.status_code == 429
    assert Lead.objects.count() == 10
    # Another client IP is not affected.
    assert post(api, body(world), REMOTE_ADDR="9.9.9.9").status_code == 201
    # Reading plans is not throttled.
    token = Lead.objects.first().token
    assert api.get(f"{URL}{token}/").status_code == 200


# --- GET ---------------------------------------------------------------------------------------
def test_plan_shape(api, world):
    token = post(api, body(world, books=[], subjects=[world["civil"].slug, world["criminal"].slug]))
    data = api.get(f"{URL}{token.json()['token']}/").json()
    assert set(data) == PLAN_KEYS
    assert data["phone_masked"] == "0912***4567"
    assert data["exam"] == {
        "name": "آزمون کانون وکلا ۱۴۰۵",
        "date": world["event"].date.isoformat(),
        "days_left": 33,
    }
    assert data["hours_per_day"] == 6
    assert set(data["summary"]) == {"total_pages", "study_days", "review_days", "pages_per_day"}
    assert data["summary"]["study_days"] + data["summary"]["review_days"] == 33
    day = data["days"][0]
    assert set(day) == {"date", "items"}
    assert day["date"] == world["today"].isoformat()
    item = day["items"][0]
    assert set(item) == {"subject", "book_title", "book_slug", "pages_from", "pages_to", "task"}
    assert set(item["subject"]) == {"id", "name", "slug", "color"}
    assert item["subject"]["slug"] == "حقوق-مدنی"  # weight 4 comes first
    assert set(data["review"][0]) == {"date", "task"}
    assert data["review"][-1]["date"] == (world["event"].date - dt.timedelta(days=1)).isoformat()
    # 33 days → ESSENTIALS; the مرکز-only and archived courses are never offered for کانون.
    courses = data["recommended_courses"]
    assert [c["title"] for c in courses] == ["امهات مدنی", "امهات جزا"]
    assert all(set(c) == COURSE_KEYS for c in courses)


@pytest.mark.parametrize(
    ("days", "expected"),
    [
        (61, ["جامع مدنی"]),
        (60, ["امهات مدنی"]),
        (15, ["امهات مدنی"]),
        (14, ["نکته و تست مدنی"]),
    ],
)
def test_recommended_courses_follow_the_timing_rule(api, world, days, expected):
    world["event"].date = world["today"] + dt.timedelta(days=days)
    world["event"].save()
    token = post(api, body(world)).json()["token"]
    data = api.get(f"{URL}{token}/").json()
    assert [c["title"] for c in data["recommended_courses"]] == expected


def test_last_weeks_recommend_tips_and_review_max_three(api, world):
    world["event"].date = world["today"] + dt.timedelta(days=10)
    world["event"].save()
    token = post(api, body(world, subjects=[world["civil"].slug, world["criminal"].slug])).json()
    data = api.get(f"{URL}{token['token']}/").json()
    titles = [c["title"] for c in data["recommended_courses"]]
    assert titles == ["نکته و تست مدنی", "تحلیل سوالات جزا"]  # one per subject, heaviest first


def test_without_exam_type_the_plan_has_no_exam(api, world):
    token = post(api, body(world, exam_type=None)).json()["token"]
    data = api.get(f"{URL}{token}/").json()
    assert data["exam"] is None
    assert data["summary"]["study_days"] + data["summary"]["review_days"] == 30
    assert [c["course_type"] for c in data["recommended_courses"]] == ["FULL"]


def test_plan_snapshot_is_kept_but_days_left_is_live(api, world):
    token = post(api, body(world)).json()["token"]
    lead = Lead.objects.get(token=token)
    first_day = lead.plan["days"][0]["date"]
    from apps.leads.services.leads import lead_plan

    later = lead_plan(lead, today=world["today"] + dt.timedelta(days=3))
    assert later["exam"]["days_left"] == 30
    assert later["days"][0]["date"] == first_day


def test_unknown_token_is_404(api, world):
    response = api.get(f"{URL}{uuid.uuid4()}/")
    assert response.status_code == 404
    assert response.json() == {"detail": "برنامه مطالعه پیدا نشد."}
    assert api.get(f"{URL}not-a-uuid/").status_code == 404


def test_get_query_count_is_bounded(api, world, django_assert_max_num_queries):
    token = post(api, body(world, books=[], subjects=[world["civil"].slug, world["criminal"].slug]))
    with django_assert_max_num_queries(5):
        assert api.get(f"{URL}{token.json()['token']}/").status_code == 200


def test_mask_phone():
    assert mask_phone("09121234567") == "0912***4567"


# --- admin -------------------------------------------------------------------------------------
@pytest.fixture
def admin_client(client):
    client.force_login(User.objects.create_superuser("09120000000", "admin-pass"))
    return client


def test_lead_admin_list_search_and_csv(api, admin_client, world):
    post(api, body(world))
    post(api, body(world, phone="09351112222"))
    changelist = reverse("admin:leads_lead_changelist")
    assert admin_client.get(changelist).status_code == 200
    found = admin_client.get(changelist, {"q": "۰۹۱۲ ۱۲۳"}).content.decode()
    assert "09121234567" in found and "09351112222" not in found
    lead = Lead.objects.get(phone="09121234567")
    assert admin_client.get(reverse("admin:leads_lead_change", args=[lead.pk])).status_code == 200
    assert admin_client.get(reverse("admin:leads_lead_add")).status_code == 403

    response = admin_client.post(
        changelist,
        {"action": "export_csv", "_selected_action": [x.pk for x in Lead.objects.all()]},
    )
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    assert "09121234567" in text and "09351112222" in text
    assert "کانون وکلا" in text and "حقوق مدنی نموداری" in text
