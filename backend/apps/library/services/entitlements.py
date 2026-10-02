"""Ebook entitlements: the only place that answers "may this user read this book?".

Stable API (Phase 4 depends on it):

* ``has_entitlement(user, book) -> bool``
* ``grant_for_order(order) -> list[EbookEntitlement]`` — call inside the transaction that marks the
  order paid; idempotent.
* ``grant(user, book, source=..., order=None)`` — admin grants; idempotent, re-activates a
  revoked one.
* ``revoke_for_order(order)`` — e.g. after a refund.
* ``library_books(user)`` — queryset of books the user may read.
"""

from django.db import transaction
from django.utils import timezone

from ..models import EbookEntitlement

DIGITAL_TYPES = ("EBOOK", "BUNDLE")


def _book_id(book) -> int:
    return book if isinstance(book, int) else book.pk


def has_entitlement(user, book) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return EbookEntitlement.objects.filter(
        user=user, book_id=_book_id(book), revoked_at__isnull=True
    ).exists()


def grant(user, book, *, source=EbookEntitlement.Source.ADMIN, order=None) -> EbookEntitlement:
    with transaction.atomic():
        ent, created = EbookEntitlement.objects.select_for_update().get_or_create(
            user=user,
            book_id=_book_id(book),
            defaults={"source": source, "source_order": order},
        )
        if not created and ent.revoked_at is not None:
            ent.revoked_at = None
            ent.source = source
            ent.source_order = order or ent.source_order
            ent.save(update_fields=["revoked_at", "source", "source_order"])
    return ent


def grant_for_order(order) -> list[EbookEntitlement]:
    """Entitle the order's user to every ebook/bundle book in it."""
    book_ids = sorted(
        {
            item.book_id
            for item in order.items.all()
            if item.variant_type in DIGITAL_TYPES and item.book_id
        }
    )
    return [
        grant(order.user, book_id, source=EbookEntitlement.Source.PURCHASE, order=order)
        for book_id in book_ids
    ]


def revoke_for_order(order) -> int:
    return EbookEntitlement.objects.filter(source_order=order, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def library_books(user):
    from apps.catalog.models import Book

    if user is None or not getattr(user, "is_authenticated", False):
        return Book.objects.none()
    return Book.objects.filter(
        entitlements__user=user, entitlements__revoked_at__isnull=True
    ).distinct()
