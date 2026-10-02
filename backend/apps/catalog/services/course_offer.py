"""``course_offer`` on the book detail: which academy courses to pitch next to a book.

Shape (``docs/api-contract.md`` → "Course cross-sell"): ``highlight`` (the course taught from this
book or by its author), good/better/best ``tiers`` with the one that fits the time left to the
exam marked ``is_recommended``, ``more``, ``free_sample``, ``discount`` and ``exam_countdown``.

Only exposed courses linked to the book (``BookCourse``) are used, and never across exam types.
The service returns model instances; ``api.serializers.serialize_course_offer`` renders JSON.
"""

import datetime as dt
from dataclasses import dataclass, field

from django.db.models import Q
from django.utils import timezone

from apps.core.money import to_persian_digits

from ..models import Book, BookCourse, ExamEvent, RelatedCourse, Subject, SubjectCourseDiscount
from .course_links import exposed_subject_courses
from .courses import (
    LAST_WEEKS_TYPES,
    candidate_sort_key,
    course_exam_ids,
    course_links_queryset,
    days_until,
    exam_label,
    exam_types_compatible,
    next_exam_event,
    recommended_reason,
    recommended_type,
)

CourseType = RelatedCourse.CourseType
Relevance = BookCourse.Relevance

MAX_MORE = 4
SUBJECT_FALLBACK_ORDER = 1000  # after every curated link
HIGHLIGHT_RELEVANCE = (Relevance.REFERENCED, Relevance.SAME_AUTHOR)
TIER_ORDER = ("best", "better", "good")
TIER_FOR_TYPE = {
    CourseType.FULL: "best",
    CourseType.ESSENTIALS: "better",
    CourseType.TIPS_TESTS: "good",
}


@dataclass
class Candidate:
    course: RelatedCourse
    relevance: str
    order: int = 0
    tier: str | None = None
    is_recommended: bool = False

    @property
    def sort_key(self):
        return candidate_sort_key(self.relevance, self.course, self.order)

    @property
    def link_key(self):
        return (BookCourse.RANK.get(self.relevance, 99), self.order, self.course.id)


@dataclass
class CourseOffer:
    subject: Subject | None
    recommended_type: str
    recommended_reason: str
    highlight: Candidate | None
    tiers: list[Candidate] = field(default_factory=list)
    more: list[Candidate] = field(default_factory=list)
    free_sample: Candidate | None = None
    discount: dict | None = None
    exam_countdown: dict | None = None


def tier_of(course: RelatedCourse) -> str | None:
    """good = free or TIPS_TESTS/REVIEW, better = ESSENTIALS, best = FULL; others: no tier."""
    if course.is_free or course.course_type in LAST_WEEKS_TYPES:
        return "good"
    if course.course_type == CourseType.ESSENTIALS:
        return "better"
    if course.course_type == CourseType.FULL:
        return "best"
    return None


def book_candidates(book: Book) -> list[Candidate]:
    """Exposed linked courses that share an exam type with the book (or either side has none)."""
    links = getattr(book, "exposed_course_links", None)
    if links is None:
        links = list(course_links_queryset().filter(book=book))
    book_exam_ids = [e.id for e in book.exam_types.all()]
    seen: set[int] = set()
    candidates = []
    for link in links:
        course = link.course
        if course.id in seen or not exam_types_compatible(course_exam_ids(course), book_exam_ids):
            continue
        seen.add(course.id)
        candidates.append(Candidate(course=course, relevance=link.relevance, order=link.order))
    return candidates


def subject_candidates(book: Book, exclude_ids: set[int]) -> list[Candidate]:
    """Exposed same-subject courses of the book (not linked) that fit its exam types.

    Used only to fill an empty tier and to find a free sample, and only for books that already
    have curated links (an empty curated list means «no course fits this book»).
    """
    subject_ids = [s.id for s in book.subjects.all()]
    if not subject_ids:
        return []
    book_exam_ids = [e.id for e in book.exam_types.all()]
    return [
        Candidate(course=course, relevance=Relevance.SAME_SUBJECT, order=SUBJECT_FALLBACK_ORDER)
        for course in exposed_subject_courses(subject_ids)
        if course.id not in exclude_ids
        and exam_types_compatible(course_exam_ids(course), book_exam_ids)
    ]


def active_discount(
    subject: Subject | None, event: ExamEvent | None, today: dt.date
) -> dict | None:
    if subject is None:
        return None
    discount = (
        SubjectCourseDiscount.objects.filter(subject=subject, is_active=True)
        .filter(Q(expires_on__isnull=True) | Q(expires_on__gte=today))
        .order_by("-id")
        .first()
    )
    if discount is None:
        return None
    expires_on = discount.expires_on or (event.date if event else None)
    label = discount.label.strip()
    if not label:
        prefix = f"{to_persian_digits(discount.percent)}٪ تخفیف" if discount.percent else "کد تخفیف"
        label = f"{prefix} دوره‌های {subject.name} برای خریداران این کتاب"
    return {
        "code": discount.code,
        "percent": discount.percent,
        "label": label,
        "expires_on": expires_on,
        "days_left": days_until(expires_on, today),
    }


def build_course_offer(
    book: Book, *, exam_type: str | None = None, today: dt.date | None = None
) -> CourseOffer | None:
    """The course offer for ``book``; ``None`` when no exposed course is relevant.

    ``exam_type`` is the selected exam type's slug (``?exam_type=``); without it (or when it has
    no upcoming event) the countdown uses the next exam of the book's own exam types.
    """
    candidates = book_candidates(book)
    if not candidates:
        return None
    today = today or timezone.localdate()

    event = next_exam_event(
        selected_slug=exam_type,
        exam_type_ids=[e.id for e in book.exam_types.all()],
        today=today,
    )
    days_left = days_until(event.date, today) if event else None
    rec_type = recommended_type(days_left)
    exam_name = exam_label(event.exam_type if event else None, event)

    highlight = min(
        (c for c in candidates if c.relevance in HIGHLIGHT_RELEVANCE),
        key=lambda c: c.link_key,
        default=None,
    )
    shown = {highlight.course.id} if highlight else set()

    extra = subject_candidates(book, {c.course.id for c in candidates})
    tiers = []
    recommended_tier = TIER_FOR_TYPE[rec_type]
    for tier in TIER_ORDER:
        pool = [c for c in candidates if c.course.id not in shown and tier_of(c.course) == tier]
        if not pool:
            pool = [c for c in extra if c.course.id not in shown and tier_of(c.course) == tier]
        if not pool:
            continue
        best = min(pool, key=lambda c: c.sort_key)
        tiers.append(
            Candidate(
                course=best.course,
                relevance=best.relevance,
                order=best.order,
                tier=tier,
                is_recommended=tier == recommended_tier,
            )
        )
        shown.add(best.course.id)

    more = sorted((c for c in candidates if c.course.id not in shown), key=lambda c: c.link_key)
    with_video = [c for c in [*candidates, *extra] if c.course.intro_video_url]
    free_sample = min(with_video, key=lambda c: (not c.course.is_free, *c.link_key), default=None)

    subjects = list(book.subjects.all())
    subject = subjects[0] if subjects else None
    return CourseOffer(
        subject=subject,
        recommended_type=rec_type,
        recommended_reason=recommended_reason(rec_type, days_left, exam_name),
        highlight=highlight,
        tiers=tiers,
        more=more[:MAX_MORE],
        free_sample=free_sample,
        discount=active_discount(subject, event, today),
        exam_countdown=(
            {"exam_name": event.name, "date": event.date, "days_left": days_left} if event else None
        ),
    )
