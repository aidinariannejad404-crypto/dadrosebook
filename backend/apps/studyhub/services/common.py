"""Shared helpers: which exam a customer studies for, and the small book shape the pages show."""

from __future__ import annotations

import datetime as dt
from collections import Counter

from django.utils import timezone

from apps.catalog.models import Book, ExamType
from apps.orders.models import Order
from apps.orders.services.ownership import PAID_STATUSES
from apps.orders.services.quote import cover_url, subject_color

VARIANT_ORDER = ("BUNDLE", "PRINT", "EBOOK")


def exam_from_books(books) -> ExamType | None:
    """The exam type most of these books belong to (ties: the exam type's own order)."""
    counts: Counter[int] = Counter()
    types: dict[int, ExamType] = {}
    for book in books:
        for exam_type in book.exam_types.all():
            if exam_type.is_active:
                counts[exam_type.pk] += 1
                types[exam_type.pk] = exam_type
    if not counts:
        return None
    best = max(counts.items(), key=lambda kv: (kv[1], -types[kv[0]].order, -kv[0]))
    return types[best[0]]


def last_paid_order(user) -> Order | None:
    return (
        Order.objects.filter(user=user, status__in=PAID_STATUSES)
        .order_by("-paid_at", "-id")
        .first()
    )


def order_books(order: Order) -> list[Book]:
    """Distinct books of an order in line order (with subjects and exam types prefetched)."""
    seen: set[int] = set()
    ids: list[int] = []
    for item in order.items.all().order_by("id"):
        if item.book_id and item.book_id not in seen:
            seen.add(item.book_id)
            ids.append(item.book_id)
    books = {
        b.pk: b for b in Book.objects.filter(pk__in=ids).prefetch_related("subjects", "exam_types")
    }
    return [books[i] for i in ids if i in books]


def resolve_exam(user, slug: str | None, *, order: Order | None = None) -> ExamType | None:
    """``slug`` (``?exam=`` / the «آزمون من» cookie) wins; else the exam of ``order`` (or of the
    customer's last paid order)."""
    if slug:
        exam_type = ExamType.objects.filter(slug=slug, is_active=True).first()
        if exam_type is not None:
            return exam_type
    order = order or last_paid_order(user)
    if order is None:
        return None
    return exam_from_books(order_books(order))


def exam_payload(exam_type: ExamType | None, today: dt.date | None = None) -> dict | None:
    if exam_type is None:
        return None
    from apps.catalog.services.courses import upcoming_events

    today = today or timezone.localdate()
    event = upcoming_events(today).filter(exam_type=exam_type).first()
    return {
        "slug": exam_type.slug,
        "name": exam_type.name,
        "event_name": event.name if event else None,
        "date": event.date.isoformat() if event else None,
        "days_left": (event.date - today).days if event else None,
    }


def buy_variant(book: Book) -> dict | None:
    """The format the «افزودن به سبد» button adds (same default as the kit builder)."""
    variants = [
        v for v in book.variants.all() if v.is_active and not v.price_is_placeholder and v.in_stock
    ]
    for kind in VARIANT_ORDER:
        for v in variants:
            if v.type == kind:
                return {
                    "id": v.pk,
                    "type": v.type,
                    "type_label": v.get_type_display(),
                    "price": v.effective_price,
                }
    return None


def book_mini(book: Book, build_url=None) -> dict:
    return {
        "id": book.pk,
        "slug": book.slug,
        "title": book.title,
        "cover": cover_url(book, build_url),
        "subject_color": subject_color(book),
    }
