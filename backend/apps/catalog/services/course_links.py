"""Automatic «دوره همین درس» links for books that have no course links yet."""

from collections.abc import Iterable

from django.db import transaction
from django.db.models import Prefetch, QuerySet

from ..models import Book, BookCourse, ExamType, RelatedCourse, Subject
from .courses import course_exam_ids, exam_types_compatible

MAX_SUGGESTED = 5

CourseType = RelatedCourse.CourseType
ResourceType = Book.ResourceType

# Book type ↔ course type pairing (research §5.1): textbook → FULL, quick review → ESSENTIALS,
# tests → TIPS_TESTS. Lower rank = suggested first.
TYPE_PREFERENCE = {
    ResourceType.TEXTBOOK: [CourseType.FULL, CourseType.ESSENTIALS, CourseType.TIPS_TESTS],
    ResourceType.COURSE_NOTES: [CourseType.FULL, CourseType.ESSENTIALS, CourseType.TIPS_TESTS],
    ResourceType.LAWS: [CourseType.FULL, CourseType.ESSENTIALS, CourseType.TIPS_TESTS],
    ResourceType.QUICK_REVIEW: [CourseType.ESSENTIALS, CourseType.TIPS_TESTS, CourseType.FULL],
    ResourceType.TESTS: [CourseType.TIPS_TESTS, CourseType.ESSENTIALS, CourseType.FULL],
}
SUBJECT_COURSE_TYPES = {
    CourseType.FULL,
    CourseType.ESSENTIALS,
    CourseType.TIPS_TESTS,
    CourseType.REVIEW,
}


def _type_rank(book: Book, course: RelatedCourse) -> int:
    preference = TYPE_PREFERENCE.get(book.resource_type, TYPE_PREFERENCE[ResourceType.TEXTBOOK])
    if course.course_type in preference:
        return preference.index(course.course_type)
    return len(preference)


def same_subject_candidates(
    book: Book, courses: Iterable[RelatedCourse], limit: int = MAX_SUGGESTED
) -> list[RelatedCourse]:
    """Exposed courses of the book's subjects that fit its exam types, best pairing first.

    ``courses`` are exposed courses with ``exam_types`` prefetched; the book's ``subjects`` and
    ``exam_types`` should be prefetched too.
    """
    subject_ids = {s.id for s in book.subjects.all()}
    book_exam_ids = [e.id for e in book.exam_types.all()]
    matches = [
        c
        for c in courses
        if c.subject_id in subject_ids
        and (c.course_type in SUBJECT_COURSE_TYPES or c.is_free)
        and exam_types_compatible(course_exam_ids(c), book_exam_ids)
    ]
    matches.sort(
        key=lambda c: (_type_rank(book, c), -(c.students_count or 0), c.effective_price, c.id)
    )
    return matches[:limit]


def exposed_subject_courses(subject_ids: Iterable[int]) -> list[RelatedCourse]:
    return list(
        RelatedCourse.objects.exposed()
        .filter(subject_id__in=list(subject_ids))
        .select_related("subject")
        .prefetch_related(Prefetch("exam_types", queryset=ExamType.objects.order_by("order", "id")))
        .order_by("order", "id")
    )


@transaction.atomic
def suggest_course_links(books: QuerySet | None = None) -> dict[str, int]:
    """Create ``same_subject`` links for the given books that have no course link at all.

    Books that already have links (explicit or earlier suggestions) are left untouched, so
    admin edits are never overwritten. Returns ``{"books": n, "links": m}``.
    """
    qs = books if books is not None else Book.objects.all()
    qs = (
        qs.filter(course_links__isnull=True)
        .distinct()
        .prefetch_related(None)
        .prefetch_related(
            Prefetch("subjects", queryset=Subject.objects.order_by("order", "id")), "exam_types"
        )
    )
    targets = list(qs)
    subject_ids = {s.id for b in targets for s in b.subjects.all()}
    courses = exposed_subject_courses(subject_ids)
    links: list[BookCourse] = []
    linked_books = 0
    for book in targets:
        picks = same_subject_candidates(book, courses)
        if picks:
            linked_books += 1
        links.extend(
            BookCourse(
                book=book,
                course=course,
                relevance=BookCourse.Relevance.SAME_SUBJECT,
                order=i,
                reason="پیشنهاد خودکار (هم‌درس)",
            )
            for i, course in enumerate(picks)
        )
    BookCourse.objects.bulk_create(links, ignore_conflicts=True)
    return {"books": linked_books, "links": len(links)}
