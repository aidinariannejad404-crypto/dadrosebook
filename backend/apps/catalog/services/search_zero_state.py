"""Search zero state (ج۳): what the header search shows on focus, before anything is typed.

There is no search-query log yet, so «پرطرفدار برای آزمون شما» is derived from the best-selling
active books of the selected exam (``Book.sales_count``). When a query log is added later, only
``popular_for_exam`` needs to change; the response shape stays the same.
"""

from django.db.models import F

from ..models import Book, ExamType, StudyKitRecommendation
from .home import resolve_exam_type, subjects_with_weight

POPULAR_LIMIT = 5
SUBJECT_LIMIT = 8


def popular_for_exam(exam: ExamType | None, limit: int = POPULAR_LIMIT) -> list[Book]:
    books = Book.objects.filter(is_active=True)
    if exam is not None:
        books = books.filter(exam_types=exam)
    return list(books.order_by(F("sales_count").desc(), "id").only("id", "slug", "title")[:limit])


def subject_shortcuts(exam: ExamType | None, limit: int = SUBJECT_LIMIT) -> list:
    """Subjects that have books; for an exam, its kit subjects by ضریب first."""
    subjects = [s for s in subjects_with_weight(exam) if s.book_count > 0]
    if exam is not None:
        kit_subject_ids = set(
            StudyKitRecommendation.objects.filter(exam_type=exam, is_active=True).values_list(
                "subject_id", flat=True
            )
        )
        in_kit = [s for s in subjects if s.id in kit_subject_ids]
        subjects = in_kit or subjects
    return subjects[:limit]


def search_zero_state(exam_slug: str | None) -> dict:
    exam = resolve_exam_type(exam_slug)
    return {
        "exam": exam,
        "popular": popular_for_exam(exam),
        "subjects": subject_shortcuts(exam),
    }
