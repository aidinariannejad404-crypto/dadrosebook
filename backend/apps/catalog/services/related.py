from django.db.models import Exists, OuterRef

from ..models import Book
from .books import book_card_queryset

RELATED_LIMIT = 8


def related_books(
    book: Book,
    limit: int = RELATED_LIMIT,
    *,
    exam_type: str | None = None,
) -> list[Book]:
    """Active, in-stock books sharing a subject with ``book``, best sellers first.

    Out-of-stock books are never suggested (UI refresh): a «bought together» rail full of
    sold-out books is a dead end. ``exam_type`` (slug) fills ``kit_role`` on the cards.
    """
    subject_ids = list(book.subjects.values_list("id", flat=True))
    if not subject_ids:
        return []
    shares_subject = Exists(
        Book.subjects.through.objects.filter(book_id=OuterRef("pk"), subject_id__in=subject_ids)
    )
    qs = book_card_queryset(
        Book.objects.filter(shares_subject).exclude(pk=book.pk), exam_type=exam_type
    ).filter(has_stock=True)
    return list(qs.order_by("-sales_count", "id")[:limit])
