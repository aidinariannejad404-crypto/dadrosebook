"""A customer's saved books (heart button)."""

from django.db import IntegrityError, transaction

from apps.catalog.models import Book

from ..models import WishlistItem


def add(user, book: Book) -> tuple[WishlistItem, bool]:
    """Idempotent: returns ``(item, created)``."""
    try:
        with transaction.atomic():
            return WishlistItem.objects.get_or_create(user=user, book=book)
    except IntegrityError:  # a concurrent request created it first
        return WishlistItem.objects.get(user=user, book=book), False


def remove(user, book_id: int) -> bool:
    deleted, _ = WishlistItem.objects.filter(user=user, book_id=book_id).delete()
    return deleted > 0


def ids(user) -> list[int]:
    return list(
        WishlistItem.objects.filter(user=user, book__is_active=True)
        .order_by("-created_at", "-id")
        .values_list("book_id", flat=True)
    )


def items(user) -> list[WishlistItem]:
    return list(
        WishlistItem.objects.filter(user=user, book__is_active=True).order_by("-created_at", "-id")
    )
