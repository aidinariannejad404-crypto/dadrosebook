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


# --- ux stream (ج۶ guest wishlist) ---------------------------------------------------------------
GUEST_LIMIT = 100


def clean_ids(raw, limit: int = GUEST_LIMIT) -> list[int]:
    """Positive integer ids from untrusted input, de-duplicated in order, at most ``limit``."""
    out: list[int] = []
    for value in raw if isinstance(raw, list | tuple) else []:
        try:
            n = int(value)
        except (TypeError, ValueError):
            continue
        if n > 0 and n not in out:
            out.append(n)
        if len(out) >= limit:
            break
    return out


def merge(user, book_ids) -> list[int]:
    """Add the guest's hearts (kept in the browser) to ``user``'s wishlist; idempotent.

    Mirrors the cart merge on login: unknown or inactive books are skipped, nothing is removed.
    Returns the user's wishlist ids after the merge.
    """
    wanted = clean_ids(book_ids)
    existing = set(WishlistItem.objects.filter(user=user).values_list("book_id", flat=True))
    valid = Book.objects.filter(id__in=[i for i in wanted if i not in existing], is_active=True)
    # Oldest heart first so the guest's newest stays at the top (ordering is -created_at).
    by_id = {b.id: b for b in valid}
    for book_id in reversed(wanted):
        if book_id in by_id:
            add(user, by_id[book_id])
    return ids(user)
