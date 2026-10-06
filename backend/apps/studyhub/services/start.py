"""Post-purchase «شروع مطالعه» (د۳): what to read first, and a study plan in one tap.

* ``read_first`` — the ebook of the order to open first: an **essential** book of the
  customer's exam kit when there is one (kit order), else the order's first readable ebook.
  ``None`` when the order grants no readable ebook (print only).
* ``plan`` — the order's books and their subjects, prefilled for the existing study-plan
  generator (``apps.leads``); ``create_plan_from_order`` builds it with the customer's own phone.
"""

from __future__ import annotations

from django.utils import timezone

from apps.catalog.models import StudyKitItem
from apps.leads.services.leads import create_study_plan_lead
from apps.library.services.entitlements import has_entitlement
from apps.orders.models import Order
from apps.reader.models import ReadingProgress

from . import reminders
from .common import book_mini, exam_payload, order_books, resolve_exam

DIGITAL_TYPES = ("EBOOK", "BUNDLE")
DEFAULT_HOURS = 6


class StartError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


NOT_PAID = "این سفارش هنوز پرداخت نشده است."


def paid_order(user, number: str) -> Order | None:
    """The customer's own paid order ``number`` (``None`` when missing or not theirs)."""
    from apps.orders.services.ownership import PAID_STATUSES

    return (
        Order.objects.filter(user=user, number=number, status__in=PAID_STATUSES)
        .prefetch_related("items")
        .first()
    )


def _readable_books(order: Order, books) -> list:
    digital = {i.book_id for i in order.items.all() if i.variant_type in DIGITAL_TYPES}
    return [b for b in books if b.pk in digital and has_entitlement(order.user, b)]


def pick_read_first(order: Order, books, exam_type):
    readable = _readable_books(order, books)
    if not readable:
        return None
    if exam_type is not None:
        ranks = {}
        for item in StudyKitItem.objects.filter(
            is_essential=True,
            recommendation__exam_type=exam_type,
            recommendation__is_active=True,
            book__in=readable,
        ).select_related("recommendation"):
            rank = (-(item.recommendation.weight or 0), item.order, item.pk)
            ranks[item.book_id] = min(ranks.get(item.book_id, rank), rank)
        essential = [b for b in readable if b.pk in ranks]
        if essential:
            return min(essential, key=lambda b: ranks[b.pk])
    return readable[0]


def start_studying(user, order: Order, *, exam_slug: str | None = None, build_url=None) -> dict:
    books = order_books(order)
    exam_type = resolve_exam(user, exam_slug, order=order)
    first = pick_read_first(order, books, exam_type)
    read_first = None
    if first is not None:
        progress = ReadingProgress.objects.filter(user=user, book=first).first()
        read_first = {
            **book_mini(first, build_url),
            "reader_url": f"/read/{first.slug}",
            "percent_read": progress.percent if progress else 0.0,
        }
    subjects = []
    seen = set()
    for book in books:
        for subject in sorted(book.subjects.all(), key=lambda s: (s.order, s.pk)):
            if subject.pk not in seen:
                seen.add(subject.pk)
                subjects.append(subject.slug)
    return {
        "order": order.number,
        "read_first": read_first,
        "exam": exam_payload(exam_type),
        "plan": {
            "exam_type": exam_type.slug if exam_type else None,
            "books": [{"slug": b.slug, "title": b.title} for b in books],
            "subjects": subjects,
        },
        "reminders": reminders.state(user),
    }


def create_plan_from_order(
    user,
    order: Order,
    *,
    exam_slug: str | None = None,
    hours_per_day: int = DEFAULT_HOURS,
    ip: str | None = None,
    user_agent: str = "",
):
    """One-tap plan: the generator of the lead magnet with the order's books and subjects.

    The lead's ``consent`` mirrors the customer's SMS study-reminder choice (never assumed).
    """
    books = order_books(order)
    if not books:
        raise StartError("کتابی در این سفارش پیدا نشد.")
    exam_type = resolve_exam(user, exam_slug, order=order)
    subjects = []
    seen = set()
    for book in books:
        for subject in sorted(book.subjects.all(), key=lambda s: (s.order, s.pk)):
            if subject.pk not in seen and subject.is_active:
                seen.add(subject.pk)
                subjects.append(subject)
    return create_study_plan_lead(
        phone=user.phone,
        exam_type=exam_type,
        subjects=subjects,
        books=books,
        hours_per_day=hours_per_day,
        consent=reminders.state(user)["sms"],
        ip=ip,
        user_agent=user_agent,
        today=timezone.localdate(),
    )
