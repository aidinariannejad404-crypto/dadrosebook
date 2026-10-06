"""Academy course helpers shared by the course API, ``course_offer`` and the study plan.

Only *exposed* courses (``RelatedCourse.objects.exposed()``: active, open for sale, known price)
ever reach the API.
"""

import datetime as dt
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Prefetch, QuerySet
from django.utils import timezone

from apps.core.money import to_persian_digits

from ..models import BookCourse, ExamEvent, ExamType, RelatedCourse

CourseType = RelatedCourse.CourseType

# Timing rule (days to the exam → which course type fits now).
FULL_MIN_DAYS = 61  # > 60 days: FULL
ESSENTIALS_MIN_DAYS = 15  # 15..60 days: ESSENTIALS; < 15: TIPS_TESTS (or REVIEW)

# Honest social proof thresholds.
MIN_STUDENTS_SHOWN = 100
MIN_REVIEWS_FOR_RATING = 3
MIN_RATING_SHOWN = Decimal("4.5")

# Types that fit the last weeks (tier "good" and the < 15 days recommendation).
LAST_WEEKS_TYPES = (CourseType.TIPS_TESTS, CourseType.REVIEW)


def exposed_courses() -> QuerySet:
    """Exposed courses with what the ``Course`` serializer needs (subject, exam types)."""
    return (
        RelatedCourse.objects.exposed()
        .select_related("subject")
        .prefetch_related(Prefetch("exam_types", queryset=ExamType.objects.order_by("order", "id")))
    )


def course_links_queryset() -> QuerySet:
    """``BookCourse`` rows of exposed courses, in link order, with course data prefetched."""
    return (
        BookCourse.objects.filter(course__in=RelatedCourse.objects.exposed())
        .select_related("course__subject")
        .prefetch_related(
            Prefetch("course__exam_types", queryset=ExamType.objects.order_by("order", "id"))
        )
        .order_by("order", "id")
    )


def recommended_type(days_left: int | None) -> str:
    """Timing rule: > 60 days FULL, 15–60 ESSENTIALS, < 15 TIPS_TESTS. No exam → FULL."""
    if days_left is None or days_left >= FULL_MIN_DAYS:
        return CourseType.FULL
    if days_left >= ESSENTIALS_MIN_DAYS:
        return CourseType.ESSENTIALS
    return CourseType.TIPS_TESTS


def type_matches(course: RelatedCourse, rec_type: str) -> bool:
    """Whether ``course`` is of the recommended kind (TIPS_TESTS also covers REVIEW)."""
    if rec_type == CourseType.TIPS_TESTS:
        return course.course_type in LAST_WEEKS_TYPES
    return course.course_type == rec_type


def exam_label(exam_type: ExamType | None, event: ExamEvent | None) -> str:
    if exam_type is not None:
        return f"آزمون {exam_type.name}"
    return event.name if event is not None else "آزمون"


def recommended_reason(rec_type: str, days_left: int | None, exam_name: str) -> str:
    """Persian sentence (Persian digits) explaining the recommendation."""
    if days_left is None:
        return "هنوز تاریخ آزمون اعلام نشده؛ برای یادگیری کامل، دوره جامع بهترین شروع است"
    if days_left == 0:
        prefix = f"امروز روز {exam_name} است"
    else:
        prefix = f"{to_persian_digits(days_left)} روز تا {exam_name}"
    tail = {
        CourseType.FULL: "برای یادگیری کامل و صفر تا صد وقت دارید",
        CourseType.ESSENTIALS: "وقت جمع‌بندی و امهات است",
        CourseType.TIPS_TESTS: "وقت نکته، تست و مرور سریع است",
    }[rec_type]
    return f"{prefix}؛ {tail}"


def exam_types_compatible(course_exam_ids: Iterable[int], book_exam_ids: Iterable[int]) -> bool:
    """False when both sides name exam types and share none (e.g. course کانون vs book مرکز)."""
    course_ids, book_ids = set(course_exam_ids), set(book_exam_ids)
    if not course_ids or not book_ids:
        return True
    return bool(course_ids & book_ids)


def course_exam_ids(course: RelatedCourse) -> list[int]:
    return [e.id for e in course.exam_types.all()]


def upcoming_events(today: dt.date | None = None) -> QuerySet:
    today = today or timezone.localdate()
    return (
        ExamEvent.objects.filter(is_active=True, date__gte=today, exam_type__is_active=True)
        .select_related("exam_type")
        .order_by("date", "id")
    )


def next_exam_event(
    *,
    selected_slug: str | None = None,
    exam_type_ids: Iterable[int] = (),
    today: dt.date | None = None,
) -> ExamEvent | None:
    """The selected exam type's next event, else the next event of one of ``exam_type_ids``."""
    events = upcoming_events(today)
    if selected_slug:
        event = events.filter(exam_type__slug=selected_slug).first()
        if event is not None:
            return event
    ids = list(exam_type_ids)
    if ids:
        return events.filter(exam_type_id__in=ids).first()
    return None


def days_until(date: dt.date | None, today: dt.date | None = None) -> int | None:
    if date is None:
        return None
    return (date - (today or timezone.localdate())).days


def students_shown(course: RelatedCourse) -> int | None:
    count = course.students_count
    return count if count is not None and count >= MIN_STUDENTS_SHOWN else None


def rating_shown(course: RelatedCourse) -> float | None:
    if (
        course.rating is not None
        and (course.reviews_count or 0) >= MIN_REVIEWS_FOR_RATING
        and course.rating >= MIN_RATING_SHOWN
    ):
        return float(course.rating)
    return None


def hours_int(course: RelatedCourse) -> int | None:
    """Teaching hours rounded to a whole hour (at least 1 when there is any)."""
    if course.hours is None or course.hours <= 0:
        return None
    return max(1, int(course.hours.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))


def price_per_hour(course: RelatedCourse) -> int | None:
    price = course.effective_price
    if course.is_free or not price or course.hours is None or course.hours <= 0:
        return None
    return int((Decimal(price) / course.hours).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def candidate_sort_key(relevance: str, course: RelatedCourse, link_order: int = 0):
    """Relevance first, then more students, then lower price, then link order."""
    return (
        BookCourse.RANK.get(relevance, 99),
        -(course.students_count or 0),
        course.effective_price,
        link_order,
        course.id,
    )
