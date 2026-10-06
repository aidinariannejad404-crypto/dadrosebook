"""Customer reviews: submit (always back to moderation), approve/reject, public summary."""

import html
import re
from collections.abc import Iterable

import nh3
from django.db import transaction
from django.db.models import Count, QuerySet
from django.utils import timezone

from apps.catalog.models import Book, ExamType
from apps.orders.models import OrderItem

from ..models import Review

BODY_MAX_LENGTH = 2000
MIN_COUNT_FOR_AVERAGE = 3
ANONYMOUS_AUTHOR = "کاربر دادرُز"
PUBLIC_LIMIT = 20

_WHITESPACE = re.compile(r"\s+")


def clean_body(text: str | None) -> str:
    """Plain text only: HTML tags stripped, whitespace collapsed, at most 2000 characters."""
    if not text:
        return ""
    stripped = nh3.clean(text, tags=set())
    # nh3 escapes the remaining text as HTML; this is a plain-text field (rendered escaped).
    stripped = html.unescape(stripped)
    return _WHITESPACE.sub(" ", stripped).strip()[:BODY_MAX_LENGTH]


def is_verified_purchase(user, book: Book) -> bool:
    return OrderItem.objects.filter(
        order__user=user, order__paid_at__isnull=False, book=book
    ).exists()


@transaction.atomic
def submit_review(
    user, book: Book, rating: int, body: str | None = "", exam_type: ExamType | None = None
) -> tuple[Review, bool]:
    """Create the user's review of ``book`` or update it; either way it goes back to PENDING."""
    if not 1 <= int(rating) <= 5:
        raise ValueError("rating must be between 1 and 5")
    review, created = Review.objects.update_or_create(
        book=book,
        user=user,
        defaults={
            "rating": int(rating),
            "body": clean_body(body),
            "exam_type": exam_type,
            "status": Review.Status.PENDING,
            "is_verified_purchase": is_verified_purchase(user, book),
            "reject_reason": "",
            "moderated_at": None,
            "moderated_by": None,
        },
    )
    return review, created


def _ids(reviews: Iterable[Review] | QuerySet) -> list[int]:
    if isinstance(reviews, QuerySet):
        return list(reviews.values_list("id", flat=True))
    return [r.id for r in reviews]


def approve(reviews: Iterable[Review] | QuerySet, moderator) -> int:
    return Review.objects.filter(id__in=_ids(reviews)).update(
        status=Review.Status.APPROVED,
        reject_reason="",
        moderated_at=timezone.now(),
        moderated_by=moderator,
    )


def reject(reviews: Iterable[Review] | QuerySet, moderator, reason: str = "") -> int:
    return Review.objects.filter(id__in=_ids(reviews)).update(
        status=Review.Status.REJECTED,
        reject_reason=(reason or "")[:200],
        moderated_at=timezone.now(),
        moderated_by=moderator,
    )


def approved_reviews(book: Book) -> QuerySet:
    return (
        Review.objects.filter(book=book, status=Review.Status.APPROVED)
        .select_related("user", "exam_type")
        .order_by("-created_at", "-id")
    )


def public_reviews(
    book: Book,
    limit: int = PUBLIC_LIMIT,
    *,
    rating: int | None = None,
    exam_type: str | None = None,
) -> list[Review]:
    """Newest approved reviews; optionally only one star rating and/or one exam (slug)."""
    qs = approved_reviews(book)
    if rating:
        qs = qs.filter(rating=rating)
    if exam_type:
        qs = qs.filter(exam_type__slug=exam_type)
    return list(qs[:limit])


def exam_breakdown(book: Book) -> list[dict]:
    """Approved reviews per exam («برای آزمون»), most reviewed first — the exam filter chips."""
    rows = (
        Review.objects.filter(book=book, status=Review.Status.APPROVED, exam_type__isnull=False)
        .values("exam_type__slug", "exam_type__name", "exam_type__short_name", "exam_type__order")
        .annotate(n=Count("id"))
        .order_by("-n", "exam_type__order")
    )
    return [
        {
            "slug": r["exam_type__slug"],
            "name": r["exam_type__name"],
            "short_name": r["exam_type__short_name"],
            "count": r["n"],
        }
        for r in rows
    ]


def summary(book: Book) -> dict:
    rows = (
        Review.objects.filter(book=book, status=Review.Status.APPROVED)
        .values("rating")
        .annotate(n=Count("id"))
    )
    distribution = {str(r): 0 for r in range(5, 0, -1)}
    for row in rows:
        distribution[str(row["rating"])] = row["n"]
    count = sum(distribution.values())
    average = None
    if count >= MIN_COUNT_FOR_AVERAGE:
        total = sum(int(k) * v for k, v in distribution.items())
        average = round(total / count, 1)
    return {
        "average": average,
        "count": count,
        "distribution": distribution,
        "exam_types": exam_breakdown(book),
    }


def author_display(user) -> str:
    """«علی ر.» — first name plus the first letter of the last name; never the phone."""
    first = (getattr(user, "first_name", "") or "").strip()
    last = (getattr(user, "last_name", "") or "").strip()
    if not first:
        return ANONYMOUS_AUTHOR
    return f"{first} {last[0]}." if last else first
