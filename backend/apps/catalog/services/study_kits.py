from collections.abc import Iterable

from django.db.models import Prefetch

from ..models import Book, StudyKitItem, StudyKitRecommendation
from .books import book_card_queryset


def study_kits(
    exam_type: str | None = None, subjects: Iterable[str] | None = None
) -> list[StudyKitRecommendation]:
    """Active recommendations (optionally for one exam type / some subjects) with ordered items.

    Each recommendation gets ``kit_items``: ordered items whose books are active and carry card
    prefetches.
    """
    qs = StudyKitRecommendation.objects.filter(
        is_active=True, exam_type__is_active=True, subject__is_active=True
    ).select_related("exam_type", "subject")
    if exam_type:
        qs = qs.filter(exam_type__slug=exam_type)
    subjects = [s for s in (subjects or []) if s]
    if subjects:
        qs = qs.filter(subject__slug__in=subjects)
    items_qs = (
        StudyKitItem.objects.filter(book__is_active=True)
        .order_by("order", "id")
        .prefetch_related(Prefetch("book", queryset=book_card_queryset(Book.objects.all())))
    )
    return list(
        qs.order_by("exam_type__order", "subject__order", "id").prefetch_related(
            Prefetch("items", queryset=items_qs, to_attr="kit_items")
        )
    )


def kit_placements(book: Book) -> list[StudyKitItem]:
    return list(
        StudyKitItem.objects.filter(
            book=book,
            recommendation__is_active=True,
            recommendation__exam_type__is_active=True,
            recommendation__subject__is_active=True,
        )
        .select_related("recommendation__exam_type", "recommendation__subject")
        .order_by("recommendation__exam_type__order", "recommendation__subject__order")
    )
