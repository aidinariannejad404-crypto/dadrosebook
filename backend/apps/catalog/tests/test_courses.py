"""Academy courses: ``Course`` shape, ``/catalog/courses/``, ``course_offer``, link suggestions."""

import datetime as dt
from decimal import Decimal
from urllib.parse import quote

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import User
from apps.catalog.api.serializers import CourseSerializer
from apps.catalog.models import (
    BookCourse,
    ExamEvent,
    ExamType,
    Person,
    RelatedCourse,
    Subject,
    SubjectCourseDiscount,
)
from apps.catalog.services.course_links import suggest_course_links
from apps.catalog.services.course_offer import build_course_offer, tier_of
from apps.catalog.services.courses import (
    exam_types_compatible,
    recommended_reason,
    recommended_type,
)

from .conftest import make_book, print_variant
from .test_api import COURSE_KEYS

pytestmark = pytest.mark.django_db

T = RelatedCourse.CourseType
R = BookCourse.Relevance
S = RelatedCourse.Status
OFFER_KEYS = {
    "subject", "recommended_type", "recommended_reason", "highlight", "tiers", "more",
    "free_sample", "discount", "exam_countdown",
}  # fmt: skip
OFFER_COURSE_KEYS = COURSE_KEYS | {"relevance", "relevance_label"}
TIER_KEYS = OFFER_COURSE_KEYS | {"tier", "is_recommended"}

_counter = {"n": 0}


def make_course(title, course_type=T.FULL, *, subject=None, exam_types=(), **kw):
    _counter["n"] += 1
    kw.setdefault("price", 1_000_000)
    course = RelatedCourse.objects.create(
        title=title,
        url=f"https://dadrose.com/courses/c-{_counter['n']}/",
        course_type=course_type,
        subject=subject,
        **kw,
    )
    course.exam_types.set(exam_types)
    return course


def link(book, course, relevance=R.SAME_SUBJECT, order=0):
    return BookCourse.objects.create(book=book, course=course, relevance=relevance, order=order)


@pytest.fixture
def world(db):
    kanoon = ExamType.objects.create(name="کانون وکلا", short_name="کانون", order=0)
    markaz = ExamType.objects.create(name="مرکز وکلا", short_name="مرکز", order=1)
    civil = Subject.objects.create(name="حقوق مدنی", color="#1F4E8C", order=0)
    commerce = Subject.objects.create(name="حقوق تجارت", color="#1E7A5A", order=1)
    bayat = Person.objects.create(name="امین بیات")
    book = make_book(
        "حقوق مدنی نموداری",
        subjects=[civil],
        exam_types=[kanoon, markaz],
        authors=[bayat],
        variants=[print_variant(900_000)],
    )
    return {
        "kanoon": kanoon,
        "markaz": markaz,
        "civil": civil,
        "commerce": commerce,
        "book": book,
        "today": timezone.localdate(),
    }


def exam_in(world, days, exam_type=None, name="آزمون کانون وکلا ۱۴۰۵"):
    return ExamEvent.objects.create(
        name=name,
        exam_type=exam_type or world["kanoon"],
        date=world["today"] + dt.timedelta(days=days),
    )


def ladder(world, *, relevance=R.SAME_SUBJECT):
    """FULL, ESSENTIALS, TIPS_TESTS and a free REVIEW course linked to the book."""
    c = world["civil"]
    courses = {
        "full": make_course("جامع مدنی", T.FULL, subject=c, price=8_125_000, hours=Decimal(50)),
        "ess": make_course("امهات مدنی", T.ESSENTIALS, subject=c, price=2_980_000, hours=30),
        "tips": make_course("نکته و تست مدنی", T.TIPS_TESTS, subject=c, price=1_500_000),
        "free": make_course(
            "تحلیل سوالات مدنی", T.REVIEW, subject=c, price=0, is_free=True, students_count=191
        ),
    }
    for i, course in enumerate(courses.values(), start=1):
        link(world["book"], course, relevance, order=i)
    return courses


def detail(api, book, **params):
    response = api.get(f"/api/v1/catalog/books/{quote(book.slug)}/", params)
    assert response.status_code == 200, response.content
    return response.json()


# --- exposure and the Course shape -------------------------------------------------------------
def test_only_open_courses_with_a_price_are_exposed(world):
    make_course("باز", status=S.OPEN)
    make_course("خارج از فهرست", status=S.OPEN_UNLISTED)
    make_course("بایگانی", status=S.ARCHIVED)
    make_course("قدیمی", status=S.LEGACY)
    make_course("غیرفعال", is_active=False)
    make_course("بدون قیمت", price=None)
    make_course("رایگان بدون قیمت", price=None, is_free=True)
    titles = set(RelatedCourse.objects.exposed().values_list("title", flat=True))
    assert titles == {"باز", "خارج از فهرست", "رایگان بدون قیمت"}


def test_course_shape_and_honest_social_proof(world):
    course = make_course(
        "امهات مدنی",
        T.ESSENTIALS,
        subject=world["civil"],
        exam_types=[world["kanoon"]],
        teachers=["سجاد یوسفی"],
        price=2_980_000,
        sale_price=2_500_000,
        hours=Decimal("10.5"),
        students_count=99,
        rating=Decimal("4.8"),
        reviews_count=2,
        selling_points=["۷۰٪ مباحث"],
    )
    data = CourseSerializer(course).data
    assert set(data) == COURSE_KEYS
    assert data["course_type_label"] == "امهات"
    assert data["subject"]["slug"] == "حقوق-مدنی"
    assert [e["short_name"] for e in data["exam_types"]] == ["کانون"]
    assert data["effective_price"] == 2_500_000
    assert data["hours"] == 11  # 10.5 rounds half up
    assert data["price_per_hour"] == 238_095  # 2_500_000 / 10.5
    assert data["students_count"] is None  # < 100 is hidden
    assert data["rating"] is None  # only 2 reviews
    assert data["reviews_count"] == 2
    assert data["teachers"] == ["سجاد یوسفی"]

    course.students_count, course.reviews_count = 100, 3
    data = CourseSerializer(course).data
    assert (data["students_count"], data["rating"]) == (100, 4.8)
    course.rating = Decimal("4.4")
    assert CourseSerializer(course).data["rating"] is None


def test_free_course_has_zero_price_and_no_price_per_hour(world):
    course = make_course("رایگان", T.REVIEW, price=None, is_free=True, hours=Decimal("1.17"))
    data = CourseSerializer(course).data
    assert (data["price"], data["effective_price"], data["is_free"]) == (0, 0, True)
    assert data["price_per_hour"] is None
    assert data["hours"] == 1


def test_course_type_labels():
    assert dict(T.choices) == {
        "FULL": "دوره جامع",
        "ESSENTIALS": "امهات",
        "TIPS_TESTS": "نکته و تست",
        "REVIEW": "جمع‌بندی",
        "WORKSHOP_ADVICE": "مشاوره و کارگاه",
        "MOCK": "آزمون آزمایشی",
        "PACKAGE": "پکیج",
        "OTHER": "سایر",
    }
    assert dict(R.choices) == {
        "referenced": "تدریس‌شده بر اساس همین کتاب",
        "same_author": "تدریس توسط مؤلف همین کتاب",
        "same_subject": "دوره همین درس",
        "general": "مهارت آزمون",
    }


# --- /catalog/courses/ -------------------------------------------------------------------------
def test_course_list_filters(api, world):
    full = make_course("جامع مدنی", T.FULL, subject=world["civil"], exam_types=[world["kanoon"]])
    tips = make_course("نکته مدنی", T.TIPS_TESTS, subject=world["civil"])
    commerce = make_course(
        "امهات تجارت", T.ESSENTIALS, subject=world["commerce"], exam_types=[world["markaz"]]
    )
    make_course("بایگانی مدنی", subject=world["civil"], status=S.ARCHIVED)

    def ids(**params):
        response = api.get("/api/v1/catalog/courses/", params)
        assert response.status_code == 200
        return [c["id"] for c in response.json()]

    data = api.get("/api/v1/catalog/courses/").json()
    assert isinstance(data, list) and set(data[0]) == COURSE_KEYS
    assert "relevance" not in data[0]
    assert ids() == [full.id, tips.id, commerce.id]
    assert ids(subject="حقوق-مدنی") == [full.id, tips.id]
    assert ids(course_type="tips_tests,ESSENTIALS") == [tips.id, commerce.id]
    assert ids(course_type="NOPE") == [full.id, tips.id, commerce.id]
    assert ids(exam_type="مرکز-وکلا") == [commerce.id]
    assert ids(subject="حقوق-مدنی", exam_type="کانون-وکلا") == [full.id]


# --- timing rule -------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("days", "expected"),
    [
        (None, "FULL"),
        (200, "FULL"),
        (61, "FULL"),
        (60, "ESSENTIALS"),
        (33, "ESSENTIALS"),
        (15, "ESSENTIALS"),
        (14, "TIPS_TESTS"),
        (1, "TIPS_TESTS"),
        (0, "TIPS_TESTS"),
    ],
)
def test_recommended_type_boundaries(days, expected):
    assert recommended_type(days) == expected


def test_recommended_reason_is_persian():
    assert (
        recommended_reason("ESSENTIALS", 33, "آزمون کانون وکلا")
        == "۳۳ روز تا آزمون کانون وکلا؛ وقت جمع‌بندی و امهات است"
    )
    assert "۷۰ روز" in recommended_reason("FULL", 70, "آزمون مرکز وکلا")
    assert recommended_reason("TIPS_TESTS", 0, "آزمون کانون وکلا").startswith("امروز")
    assert "دوره جامع" in recommended_reason("FULL", None, "آزمون")


def test_exam_type_compatibility():
    assert exam_types_compatible([1], [1, 2])
    assert not exam_types_compatible([1], [2])
    assert exam_types_compatible([], [2])
    assert exam_types_compatible([1], [])


def test_tier_of():
    assert tier_of(RelatedCourse(course_type=T.FULL)) == "best"
    assert tier_of(RelatedCourse(course_type=T.ESSENTIALS)) == "better"
    assert tier_of(RelatedCourse(course_type=T.TIPS_TESTS)) == "good"
    assert tier_of(RelatedCourse(course_type=T.REVIEW)) == "good"
    assert tier_of(RelatedCourse(course_type=T.FULL, is_free=True)) == "good"
    assert tier_of(RelatedCourse(course_type=T.WORKSHOP_ADVICE)) is None


# --- course_offer ------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("days", "rec_type", "recommended_tier"),
    [(61, "FULL", "best"), (60, "ESSENTIALS", "better"), (15, "ESSENTIALS", "better"),
     (14, "TIPS_TESTS", "good")],
)  # fmt: skip
def test_offer_tiers_and_timing(world, days, rec_type, recommended_tier):
    courses = ladder(world)
    exam_in(world, days)
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.recommended_type == rec_type
    assert [t.tier for t in offer.tiers] == ["best", "better", "good"]
    assert [t.course for t in offer.tiers][:2] == [courses["full"], courses["ess"]]
    assert [t.tier for t in offer.tiers if t.is_recommended] == [recommended_tier]
    assert offer.exam_countdown["days_left"] == days
    assert offer.highlight is None


def test_good_tier_prefers_more_students_then_lower_price(world):
    c = world["civil"]
    a = make_course("نکته الف", T.TIPS_TESTS, subject=c, price=1_500_000, students_count=318)
    b = make_course("تحلیل رایگان", T.REVIEW, subject=c, price=0, is_free=True, students_count=191)
    d = make_course("نکته ارزان", T.TIPS_TESTS, subject=c, price=900_000, students_count=318)
    for course in (a, b, d):
        link(world["book"], course)
    offer = build_course_offer(world["book"], today=world["today"])
    assert [(t.tier, t.course) for t in offer.tiers] == [("good", d)]
    assert {m.course for m in offer.more} == {a, b}


def test_tier_choice_prefers_relevance(world):
    c = world["civil"]
    popular = make_course("جامع پرفروش", T.FULL, subject=c, students_count=900)
    own = make_course("جامع مؤلف", T.FULL, subject=c, students_count=10)
    other = make_course("جامع دیگر", T.FULL, subject=c, students_count=50)
    link(world["book"], popular, R.SAME_SUBJECT, 0)
    link(world["book"], other, R.SAME_AUTHOR, 1)
    link(world["book"], own, R.REFERENCED, 2)
    offer = build_course_offer(world["book"], today=world["today"])
    # The referenced course is the highlight; among the rest same_author beats popularity.
    assert offer.highlight.course == own and offer.highlight.relevance == "referenced"
    assert [(t.tier, t.course) for t in offer.tiers] == [("best", other)]
    assert [m.course for m in offer.more] == [popular]


def test_highlight_falls_back_to_same_author(world):
    c = world["civil"]
    same_author = make_course("دوره مؤلف", T.ESSENTIALS, subject=c)
    general = make_course("تکنیک تست", T.WORKSHOP_ADVICE)
    link(world["book"], general, R.GENERAL, 0)
    link(world["book"], same_author, R.SAME_AUTHOR, 1)
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.highlight.course == same_author
    assert offer.tiers == []
    assert [m.course for m in offer.more] == [general]


def test_more_is_capped_and_excludes_shown(world):
    c = world["civil"]
    courses = [make_course(f"ماژول {i}", T.FULL, subject=c, students_count=i) for i in range(7)]
    for i, course in enumerate(courses):
        link(world["book"], course, R.REFERENCED, i)
    offer = build_course_offer(world["book"], today=world["today"])
    shown = {offer.highlight.course.id} | {t.course.id for t in offer.tiers}
    assert offer.highlight.course == courses[0]
    assert len(offer.more) == 4
    assert not shown & {m.course.id for m in offer.more}


def test_empty_tier_is_filled_from_same_subject_courses(world):
    c = world["civil"]
    own = make_course("مدنی ۲ تا ۸", T.FULL, subject=c)
    module = make_course("مدنی ۳", T.FULL, subject=c, students_count=206)
    link(world["book"], own, R.REFERENCED, 0)
    link(world["book"], module, R.REFERENCED, 1)
    essentials = make_course("امهات مدنی", T.ESSENTIALS, subject=c, students_count=588)
    make_course("امهات تجارت", T.ESSENTIALS, subject=world["commerce"])
    make_course("امهات مدنی کانون", T.ESSENTIALS, subject=c, exam_types=[ExamType.objects.create(
        name="قضاوت", short_name="قضاوت")])  # fmt: skip
    exam_in(world, 34)
    offer = build_course_offer(world["book"], today=world["today"])
    assert [(t.tier, t.course, t.relevance) for t in offer.tiers] == [
        ("best", module, "referenced"),
        ("better", essentials, "same_subject"),
    ]
    assert offer.tiers[1].is_recommended


def test_no_offer_without_open_linked_courses(world):
    # Same-subject courses alone do not create an offer: an empty curated list means «none fits».
    make_course("امهات مدنی", T.ESSENTIALS, subject=world["civil"])
    assert build_course_offer(world["book"], today=world["today"]) is None
    link(world["book"], make_course("بایگانی", subject=world["civil"], status=S.ARCHIVED))
    assert build_course_offer(world["book"], today=world["today"]) is None


def test_never_crosses_exam_types(world):
    kanoon_book = make_book("کتاب کانون", subjects=[world["civil"]], exam_types=[world["kanoon"]])
    markaz_book = make_book("کتاب مرکز", subjects=[world["civil"]], exam_types=[world["markaz"]])
    kanoon_only = make_course("فقط کانون", T.ESSENTIALS, exam_types=[world["kanoon"]])
    markaz_only = make_course("فقط مرکز", T.ESSENTIALS, exam_types=[world["markaz"]])
    both = make_course("هر دو", T.FULL, exam_types=[world["kanoon"], world["markaz"]])
    for book in (kanoon_book, markaz_book):
        for course in (kanoon_only, markaz_only, both):
            link(book, course)

    def offered(book):
        offer = build_course_offer(book, today=world["today"])
        return {t.course.title for t in offer.tiers} | {m.course.title for m in offer.more}

    assert offered(kanoon_book) == {"فقط کانون", "هر دو"}
    assert offered(markaz_book) == {"فقط مرکز", "هر دو"}
    only_markaz_courses = make_book(
        "کتاب کانون ۲", subjects=[world["civil"]], exam_types=[world["kanoon"]]
    )
    link(only_markaz_courses, markaz_only)
    assert build_course_offer(only_markaz_courses, today=world["today"]) is None


def test_free_sample_prefers_free_course_with_video(world):
    c = world["civil"]
    paid = make_course("جامع با ویدیو", T.FULL, subject=c, intro_video_url="https://aparat.com/v/a")
    link(world["book"], paid, R.REFERENCED, 0)
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.free_sample.course == paid
    assert offer.free_sample.course.intro_video_url == "https://aparat.com/v/a"
    # A free course of the same subject with a video wins, linked or not.
    free = make_course(
        "رایگان با ویدیو",
        T.REVIEW,
        subject=c,
        is_free=True,
        price=0,
        intro_video_url="https://aparat.com/v/b",
    )
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.free_sample.course == free
    assert offer.free_sample.relevance == "same_subject"
    other_subject = make_book("کتاب تجارت", subjects=[world["commerce"]])
    link(other_subject, make_course("تجارت", T.FULL, subject=world["commerce"]))
    assert build_course_offer(other_subject, today=world["today"]).free_sample is None


def test_discount_defaults_to_exam_date_and_hides_when_expired(world):
    ladder(world)
    event = exam_in(world, 33)
    assert build_course_offer(world["book"], today=world["today"]).discount is None

    discount = SubjectCourseDiscount.objects.create(
        subject=world["civil"], code="MADANI15", percent=15
    )
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.discount == {
        "code": "MADANI15",
        "percent": 15,
        "label": "۱۵٪ تخفیف دوره‌های حقوق مدنی برای خریداران این کتاب",
        "expires_on": event.date,
        "days_left": 33,
    }

    discount.expires_on = world["today"] + dt.timedelta(days=7)
    discount.label = "کد ویژه خریداران کتاب"
    discount.save()
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.discount["days_left"] == 7 and offer.discount["label"] == "کد ویژه خریداران کتاب"

    discount.expires_on = world["today"] - dt.timedelta(days=1)
    discount.save()
    assert build_course_offer(world["book"], today=world["today"]).discount is None

    discount.expires_on, discount.is_active = None, False
    discount.save()
    assert build_course_offer(world["book"], today=world["today"]).discount is None


def test_discount_without_percent_has_generic_label(world):
    ladder(world)
    SubjectCourseDiscount.objects.create(subject=world["civil"], code="KETAB")
    offer = build_course_offer(world["book"], today=world["today"])
    assert offer.discount["label"] == "کد تخفیف دوره‌های حقوق مدنی برای خریداران این کتاب"
    assert offer.discount["percent"] is None
    assert offer.discount["expires_on"] is None and offer.discount["days_left"] is None
    assert offer.exam_countdown is None
    assert offer.recommended_type == "FULL"


# --- API ---------------------------------------------------------------------------------------
def test_book_detail_course_offer_shape(api, world):
    ladder(world)
    own = make_course("مدنی ۲ تا ۸", T.FULL, subject=world["civil"], teachers=["امین بیات"])
    link(world["book"], own, R.REFERENCED, order=0)
    make_course("بایگانی", subject=world["civil"], status=S.ARCHIVED)
    exam_in(world, 33)
    SubjectCourseDiscount.objects.create(subject=world["civil"], code="MADANI15", percent=15)

    data = detail(api, world["book"])
    offer = data["course_offer"]
    assert set(offer) == OFFER_KEYS
    assert offer["subject"]["slug"] == "حقوق-مدنی"
    assert offer["recommended_type"] == "ESSENTIALS"
    assert offer["recommended_reason"] == "۳۳ روز تا آزمون کانون وکلا؛ وقت جمع‌بندی و امهات است"
    assert set(offer["highlight"]) == OFFER_COURSE_KEYS
    assert offer["highlight"]["relevance_label"] == "تدریس‌شده بر اساس همین کتاب"
    assert [t["tier"] for t in offer["tiers"]] == ["best", "better", "good"]
    assert all(set(t) == TIER_KEYS for t in offer["tiers"])
    assert [t["is_recommended"] for t in offer["tiers"]] == [False, True, False]
    assert all(set(m) == OFFER_COURSE_KEYS for m in offer["more"])
    assert offer["free_sample"] is None
    assert offer["discount"]["expires_on"] == (world["today"] + dt.timedelta(days=33)).isoformat()
    assert offer["exam_countdown"] == {
        "exam_name": "آزمون کانون وکلا ۱۴۰۵",
        "date": (world["today"] + dt.timedelta(days=33)).isoformat(),
        "days_left": 33,
    }
    # related_courses: every open linked course, in link order, without relevance.
    assert data["related_courses"][0]["title"] == "مدنی ۲ تا ۸"
    assert len(data["related_courses"]) == 5
    assert all(set(c) == COURSE_KEYS for c in data["related_courses"])
    assert data["course_badge"] == "مدنی ۲ تا ۸"


def test_selected_exam_type_drives_the_countdown(api, world):
    ladder(world)
    exam_in(world, 34)
    exam_in(world, 70, world["markaz"], name="آزمون مرکز وکلا ۱۴۰۵")
    assert detail(api, world["book"])["course_offer"]["recommended_type"] == "ESSENTIALS"
    offer = detail(api, world["book"], exam_type="مرکز-وکلا")["course_offer"]
    assert offer["recommended_type"] == "FULL"
    assert offer["exam_countdown"]["exam_name"] == "آزمون مرکز وکلا ۱۴۰۵"
    assert [t["is_recommended"] for t in offer["tiers"]] == [True, False, False]


def test_book_without_courses_has_null_offer(api, world):
    data = detail(api, world["book"])
    assert data["course_offer"] is None and data["related_courses"] == []
    assert data["course_badge"] is None


def test_course_badge_only_for_course_source_links(api, world):
    course = make_course("امهات مدنی", T.ESSENTIALS, subject=world["civil"])
    row = link(world["book"], course, R.SAME_SUBJECT)
    assert detail(api, world["book"])["course_badge"] is None
    row.relevance = R.SAME_AUTHOR
    row.save()
    assert detail(api, world["book"])["course_badge"] == "امهات مدنی"
    course.status = S.ARCHIVED
    course.save()
    assert detail(api, world["book"])["course_badge"] is None


def test_detail_query_count_does_not_grow_with_courses(api, world):
    exam_in(world, 34)
    SubjectCourseDiscount.objects.create(subject=world["civil"], code="X", percent=10)
    link(world["book"], make_course("یک", T.FULL, subject=world["civil"]), R.REFERENCED)
    url = f"/api/v1/catalog/books/{quote(world['book'].slug)}/"
    with CaptureQueriesContext(connection) as small:
        assert api.get(url).status_code == 200
    ladder(world)
    for i in range(6):
        course = make_course(f"ماژول {i}", T.FULL, subject=world["civil"], exam_types=[
            world["kanoon"], world["markaz"]])  # fmt: skip
        link(world["book"], course, R.REFERENCED, 10 + i)
    with CaptureQueriesContext(connection) as large:
        assert api.get(url).status_code == 200
    assert len(large) == len(small)
    assert len(large) <= 25


def test_course_list_query_count(api, world):
    for i in range(8):
        make_course(f"دوره {i}", subject=world["civil"], exam_types=[world["kanoon"]])
    with CaptureQueriesContext(connection) as ctx:
        assert len(api.get("/api/v1/catalog/courses/").json()) == 8
    assert len(ctx) <= 3


# --- automatic same-subject links --------------------------------------------------------------
def test_suggest_course_links(world):
    c = world["civil"]
    full = make_course("جامع مدنی", T.FULL, subject=c, students_count=283)
    ess = make_course("امهات مدنی", T.ESSENTIALS, subject=c, students_count=588)
    tips = make_course("نکته و تست مدنی", T.TIPS_TESTS, subject=c, students_count=318)
    make_course("کارگاه", T.WORKSHOP_ADVICE, subject=c)
    markaz = make_course("فقط مرکز", T.FULL, subject=c, exam_types=[world["markaz"]])
    make_course("بایگانی", T.FULL, subject=c, status=S.ARCHIVED)
    make_course("تجارت", T.FULL, subject=world["commerce"])
    tests_book = make_book(
        "تست مدنی", subjects=[c], exam_types=[world["kanoon"]], resource_type="TESTS"
    )
    linked = make_book("کتاب با دوره", subjects=[c])
    link(linked, full, R.REFERENCED)

    result = suggest_course_links()
    assert result == {"books": 2, "links": 7}
    textbook_links = list(world["book"].course_links.order_by("order"))
    # Textbook → FULL first; the مرکز-only course fits this کانون + مرکز book.
    assert [x.course for x in textbook_links] == [full, markaz, ess, tips]
    assert {x.relevance for x in textbook_links} == {"same_subject"}
    # Tests book → TIPS_TESTS first; the مرکز-only course never reaches this کانون-only book.
    assert [x.course for x in tests_book.course_links.order_by("order")] == [tips, ess, full]
    assert [x.course for x in linked.course_links.all()] == [full]  # untouched
    assert suggest_course_links() == {"books": 0, "links": 0}  # idempotent


def test_admin_suggest_action_and_course_admin(client, world):
    user = User.objects.create_superuser("09120000000", "admin-pass")
    client.force_login(user)
    make_course("امهات مدنی", T.ESSENTIALS, subject=world["civil"], hours=Decimal("12.5"))
    response = client.post(
        reverse("admin:catalog_book_changelist"),
        {"action": "suggest_courses", "_selected_action": [world["book"].pk]},
        follow=True,
    )
    assert response.status_code == 200
    assert world["book"].course_links.count() == 1
    assert "پیوند" in response.content.decode()
    listing = client.get(reverse("admin:catalog_relatedcourse_changelist")).content.decode()
    assert "۱۲.۵" in listing
    page = client.get(reverse("admin:catalog_book_change", args=[world["book"].pk]))
    assert "دوره‌های مرتبط" in page.content.decode()


def test_admin_discount_accepts_jalali_date(client, world):
    user = User.objects.create_superuser("09120000000", "admin-pass")
    client.force_login(user)
    response = client.post(
        reverse("admin:catalog_subjectcoursediscount_add"),
        {
            "subject": world["civil"].pk,
            "code": "MADANI15",
            "percent": 15,
            "label": "",
            "expires_on": "۱۴۰۵/۰۸/۰۷",
            "is_active": "on",
        },
    )
    assert response.status_code == 302, response.content.decode()[:2000]
    assert str(SubjectCourseDiscount.objects.get().expires_on) == "2026-10-29"
