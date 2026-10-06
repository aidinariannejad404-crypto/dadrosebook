"""The customer's «خبرم کن» (back-in-stock) list in the account, with cancel (د۴).

A request belongs to the customer when it is linked to their user or was made with their phone
before they logged in. Pending requests are listed, plus ones notified in the last 30 days (so
"it's back" is visible in the account too).
"""

from __future__ import annotations

import datetime as dt

from django.db.models import Q
from django.utils import timezone

from apps.engagement.models import BackInStockRequest
from apps.orders.services.quote import cover_url, subject_color

RECENT_NOTIFIED_DAYS = 30
Status = BackInStockRequest.Status


def _mine(user):
    return BackInStockRequest.objects.filter(Q(user=user) | Q(phone=user.phone))


def notify_list(user, *, build_url=None, now: dt.datetime | None = None) -> list[dict]:
    now = now or timezone.now()
    since = now - dt.timedelta(days=RECENT_NOTIFIED_DAYS)
    rows = (
        _mine(user)
        .filter(Q(status=Status.PENDING) | Q(status=Status.NOTIFIED, notified_at__gte=since))
        .select_related("variant__book")
        .prefetch_related("variant__book__subjects")
        .order_by("-created_at")
    )
    result = []
    for req in rows:
        variant = req.variant
        book = variant.book
        result.append(
            {
                "id": req.pk,
                "status": req.status,
                "status_label": req.get_status_display(),
                "created_at": req.created_at.isoformat(),
                "notified_at": req.notified_at.isoformat() if req.notified_at else None,
                "book": {
                    "id": book.pk,
                    "slug": book.slug,
                    "title": book.title,
                    "cover": cover_url(book, build_url),
                    "subject_color": subject_color(book),
                },
                "variant": {
                    "id": variant.pk,
                    "type": variant.type,
                    "type_label": variant.get_type_display(),
                    "in_stock": bool(variant.is_active and variant.in_stock),
                },
            }
        )
    return result


def cancel(user, request_id: int) -> bool:
    """Cancel one pending request of this customer; ``False`` when there is none to cancel."""
    return bool(
        _mine(user)
        .filter(pk=request_id, status=Status.PENDING)
        .update(status=Status.CANCELLED, updated_at=timezone.now())
    )
