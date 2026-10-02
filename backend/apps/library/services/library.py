"""The «کتابخانه من» list: the user's active entitlements with ready-to-render books."""

from apps.catalog.models import Book
from apps.catalog.services.books import book_card_queryset, card_prefetches

from ..models import EbookEntitlement


def active_entitlements(user) -> list[EbookEntitlement]:
    """Active entitlements, newest first, each with ``book`` set to a card-ready ``Book``.

    Books deactivated in the catalog stay in the library (the customer paid for them).
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return []
    entitlements = list(
        EbookEntitlement.objects.filter(user=user, revoked_at__isnull=True)
        .select_related("source_order")
        .order_by("-created_at", "-id")
    )
    ids = {e.book_id for e in entitlements}
    books = {b.pk: b for b in book_card_queryset(Book.objects.filter(pk__in=ids))}
    missing = ids - books.keys()
    if missing:
        inactive = Book.objects.filter(pk__in=missing).prefetch_related(*card_prefetches())
        books.update((b.pk, b) for b in inactive)
    for entitlement in entitlements:
        entitlement.book = books[entitlement.book_id]
    return entitlements
