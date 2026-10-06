"""«این کتاب را دارید» (د۱): which books a customer already owns, and in which format.

* **EBOOK** — an active ``EbookEntitlement`` (purchase or admin grant; revoked ones don't count).
* **PRINT** — a PRINT or BUNDLE line of a paid order (PAID → DELIVERED) that was not fully
  refunded through a return. ``purchased_at`` is the latest such payment.

The result is small (ids, slugs, formats, dates) so the storefront can fetch it client-side once
per page and keep catalog pages cacheable for everyone.
"""

from __future__ import annotations

from collections import defaultdict

from django.db.models import Sum

from ..models import Order, OrderItem, ReturnRequest

PAID_STATUSES = (
    Order.Status.PAID,
    Order.Status.PROCESSING,
    Order.Status.SHIPPED,
    Order.Status.DELIVERED,
)
PRINT_TYPES = ("PRINT", "BUNDLE")


def _refunded_quantities(item_ids: list[int]) -> dict[int, int]:
    from ..models import ReturnLine

    rows = (
        ReturnLine.objects.filter(
            order_item_id__in=item_ids,
            return_request__status=ReturnRequest.Status.REFUNDED,
        )
        .values("order_item_id")
        .annotate(qty=Sum("quantity"))
    )
    return {r["order_item_id"]: r["qty"] or 0 for r in rows}


def owned_books(user) -> list[dict]:
    """``[{book_id, slug, title, formats, can_read, purchased_at, order_number}]``, newest first."""
    if user is None or not getattr(user, "is_authenticated", False):
        return []
    from apps.library.models import EbookEntitlement

    owned: dict[int, dict] = {}

    def entry(book) -> dict:
        row = owned.get(book.pk)
        if row is None:
            row = owned[book.pk] = {
                "book_id": book.pk,
                "slug": book.slug,
                "title": book.title,
                "formats": [],
                "can_read": False,
                "purchased_at": None,
                "order_number": None,
            }
        return row

    items = list(
        OrderItem.objects.filter(
            order__user=user,
            order__status__in=PAID_STATUSES,
            variant_type__in=PRINT_TYPES,
            book__isnull=False,
        )
        .select_related("book", "order")
        .order_by("-order__paid_at", "-order_id")
    )
    refunded = _refunded_quantities([i.pk for i in items])
    for item in items:
        if item.quantity - refunded.get(item.pk, 0) <= 0:
            continue
        row = entry(item.book)
        if "PRINT" not in row["formats"]:
            row["formats"].append("PRINT")
        paid_at = item.order.paid_at or item.order.created_at
        if row["purchased_at"] is None or paid_at > row["purchased_at"]:
            row["purchased_at"] = paid_at
            row["order_number"] = item.order.number

    entitlements = EbookEntitlement.objects.filter(
        user=user, revoked_at__isnull=True
    ).select_related("book", "source_order")
    for ent in entitlements:
        row = entry(ent.book)
        if "EBOOK" not in row["formats"]:
            row["formats"].append("EBOOK")
        row["can_read"] = True
        if row["purchased_at"] is None:
            row["purchased_at"] = ent.created_at
            row["order_number"] = ent.source_order.number if ent.source_order else None

    result = list(owned.values())
    for row in result:
        row["formats"].sort(key=lambda f: ("PRINT", "EBOOK").index(f))
    result.sort(key=lambda r: r["purchased_at"], reverse=True)
    return result


def owned_formats(user) -> dict[int, set[str]]:
    """``{book_id: {"PRINT", "EBOOK"}}`` — for services (readiness, start-studying)."""
    result: dict[int, set[str]] = defaultdict(set)
    for row in owned_books(user):
        result[row["book_id"]].update(row["formats"])
    return dict(result)
