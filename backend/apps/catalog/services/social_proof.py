"""Honest social proof: subject bestseller rank (top 3) and this season's buyers (≥ 20)."""

from django.db.models import IntegerField, OuterRef, Q, Subquery

MAX_SUBJECT_RANK = 3
SEASON_BUYERS_MIN = 20


class SubqueryCount(Subquery):
    """``COUNT(*)`` of a correlated subquery (0 when it matches nothing)."""

    template = "(SELECT COUNT(*) FROM (%(subquery)s) _count)"
    output_field = IntegerField()


def first_subject_expression():
    """ID of the book's first subject (by ``Subject.order``, as shown on cards)."""
    from ..models import Book

    return Subquery(
        Book.subjects.through.objects.filter(book_id=OuterRef("pk"))
        .order_by("subject__order", "subject_id")
        .values("subject_id")[:1]
    )


def books_ahead_in_subject_expression():
    """Active books in the outer book's first subject that sell more (ties: lower id first).

    Needs the ``first_subject_id`` annotation (``first_subject_expression``) on the outer queryset.
    """
    from ..models import Book

    ahead = (
        Book.objects.filter(is_active=True, subjects=OuterRef("first_subject_id"))
        .filter(
            Q(sales_count__gt=OuterRef("sales_count"))
            | Q(sales_count=OuterRef("sales_count"), id__lt=OuterRef("pk"))
        )
        .order_by()
        .values("id")
    )
    return SubqueryCount(ahead)


def subject_rank(sales_count: int, books_ahead: int | None) -> int | None:
    """1..3 within the book's first subject, only for books that actually sold; else None."""
    if not sales_count or books_ahead is None:
        return None
    rank = books_ahead + 1
    return rank if rank <= MAX_SUBJECT_RANK else None


def season_buyers(season_sales_count: int) -> int | None:
    """Shown only when at least ``SEASON_BUYERS_MIN`` people bought it this season."""
    return season_sales_count if season_sales_count >= SEASON_BUYERS_MIN else None


def book_social_proof(book) -> dict:
    """``{"subject_rank": int|None, "season_buyers": int|None}`` for a card-queryset book."""
    ahead = getattr(book, "books_ahead_in_subject", None)
    has_subject = getattr(book, "first_subject_id", None) is not None
    return {
        "subject_rank": subject_rank(book.sales_count, ahead) if has_subject else None,
        "season_buyers": season_buyers(book.season_sales_count),
    }
