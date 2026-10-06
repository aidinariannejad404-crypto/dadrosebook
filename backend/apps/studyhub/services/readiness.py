"""Readiness dashboard (د۴): «آمادگی منابع: ۵ از ۷ درس».

For the customer's exam (``?exam=`` / cookie, else the exam of their last paid order) and every
subject of that exam's study kit that has essential books:

* each essential book: owned (any format, see ``orders.services.ownership``) ✓ or missing (with
  the variant an «افزودن به سبد» button adds), and % read for owned ebooks (``ReadingProgress``);
* the subject is **ready** when every essential book is owned;
* ``percent_read`` is the average over the subject's owned ebooks (``None`` when there are none,
  since print reading is not tracked).

Subjects keep the kit order: weight (ضریب) first, then the subject's own order.
"""

from __future__ import annotations

import datetime as dt

from django.db.models import Prefetch
from django.utils import timezone

from apps.catalog.models import BookVariant, StudyKitItem, StudyKitRecommendation, Subject
from apps.orders.services.ownership import owned_formats
from apps.reader.models import ReadingProgress

from .common import book_mini, buy_variant, exam_payload, resolve_exam


def headline(ready: int, total: int) -> str:
    from apps.core.money import to_persian_digits

    return f"آمادگی منابع: {to_persian_digits(str(ready))} از {to_persian_digits(str(total))} درس"


def _recommendations(exam_type):
    items = (
        StudyKitItem.objects.filter(is_essential=True, book__is_active=True)
        .select_related("book")
        .prefetch_related(
            Prefetch("book__subjects", queryset=Subject.objects.order_by("order", "id")),
            Prefetch("book__variants", queryset=BookVariant.objects.filter(is_active=True)),
        )
        .order_by("order", "id")
    )
    recs = (
        StudyKitRecommendation.objects.filter(
            exam_type=exam_type, is_active=True, subject__is_active=True
        )
        .select_related("subject")
        .prefetch_related(Prefetch("items", queryset=items, to_attr="essential_items"))
    )
    return sorted(recs, key=lambda r: (-(r.weight or 0), r.subject.order, r.subject.pk))


def readiness(
    user, *, exam_slug: str | None = None, build_url=None, today: dt.date | None = None
) -> dict:
    today = today or timezone.localdate()
    exam_type = resolve_exam(user, exam_slug)
    result = {
        "exam": exam_payload(exam_type, today),
        "subjects": [],
        "ready_subjects": 0,
        "total_subjects": 0,
        "headline": "",
    }
    if exam_type is None:
        return result

    owned = owned_formats(user)
    progress = {p.book_id: p.percent for p in ReadingProgress.objects.filter(user=user)}
    subjects = []
    for rec in _recommendations(exam_type):
        if not rec.essential_items:
            continue
        books = []
        percents = []
        for item in rec.essential_items:
            book = item.book
            formats = sorted(owned.get(book.pk, ()), key=("PRINT", "EBOOK").index)
            percent = None
            if "EBOOK" in formats:
                percent = float(progress.get(book.pk, 0.0))
                percents.append(percent)
            books.append(
                {
                    **book_mini(book, build_url),
                    "owned": bool(formats),
                    "formats": formats,
                    "percent_read": percent,
                    "buy_variant": None if formats else buy_variant(book),
                }
            )
        owned_count = sum(1 for b in books if b["owned"])
        subjects.append(
            {
                "subject": {
                    "id": rec.subject.pk,
                    "name": rec.subject.name,
                    "slug": rec.subject.slug,
                    "color": rec.subject.color,
                },
                "weight": rec.weight,
                "essential_total": len(books),
                "essential_owned": owned_count,
                "ready": owned_count == len(books),
                "percent_read": round(sum(percents) / len(percents), 1) if percents else None,
                "books": books,
            }
        )
    ready = sum(1 for s in subjects if s["ready"])
    result.update(
        subjects=subjects,
        ready_subjects=ready,
        total_subjects=len(subjects),
        headline=headline(ready, len(subjects)) if subjects else "",
    )
    return result
