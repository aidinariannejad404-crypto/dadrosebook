"""Card ratings from approved reviews (``apps.reviews``, read-only).

Computed as correlated subqueries on the card queryset (no joins, so they never multiply the
variant aggregates, and no per-book queries). Cards show stars only from ``CARD_MIN_COUNT``
approved reviews up: a 5.0 from two reviews is not a signal worth a badge.
"""

from django.db.models import Avg, Count, FloatField, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.reviews.models import Review

CARD_MIN_COUNT = 5


def rating_annotations() -> dict:
    """``approved_rating_avg`` (float|None) and ``approved_rating_count`` (int) for books."""
    grouped = (
        Review.objects.filter(book_id=OuterRef("pk"), status=Review.Status.APPROVED)
        .order_by()
        .values("book_id")
    )
    return {
        "approved_rating_avg": Subquery(
            grouped.annotate(a=Avg("rating")).values("a")[:1], output_field=FloatField()
        ),
        "approved_rating_count": Coalesce(
            Subquery(grouped.annotate(n=Count("id")).values("n")[:1], output_field=IntegerField()),
            0,
        ),
    }


def card_rating(avg: float | None, count: int | None) -> dict:
    """``{"rating_avg": float|None, "rating_count": int}`` — the average only from 5 reviews up."""
    count = int(count or 0)
    if avg is None or count < CARD_MIN_COUNT:
        return {"rating_avg": None, "rating_count": count}
    return {"rating_avg": round(float(avg), 1), "rating_count": count}


def book_card_rating(book) -> dict:
    """``card_rating`` from the queryset annotations, or one aggregate query as a fallback."""
    if hasattr(book, "approved_rating_count"):
        return card_rating(book.approved_rating_avg, book.approved_rating_count)
    agg = Review.objects.filter(book=book, status=Review.Status.APPROVED).aggregate(
        avg=Avg("rating"), n=Count("id")
    )
    return card_rating(agg["avg"], agg["n"])
