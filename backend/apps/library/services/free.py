"""ه۶: free ebooks (e.g. statute texts) claimed with «دریافت رایگان».

A free book is a ``Book`` with ``is_free_ebook``; claiming it (logged in) grants an ordinary
entitlement with ``Source.FREE``, so the reader, library, devices and offline rules all apply
unchanged. An existing purchase is never downgraded.
"""

from ..models import EbookEntitlement, EbookFile
from .entitlements import grant


class NotFree(ValueError):
    pass


def is_claimable(book) -> bool:
    return bool(
        book.is_active
        and book.is_free_ebook
        and EbookFile.objects.filter(book=book, is_active=True).exclude(file="").exists()
    )


def claim_free(user, book) -> tuple[EbookEntitlement, bool]:
    """``(entitlement, created)``; raises ``NotFree`` when the book is not a free ebook."""
    if not book.is_free_ebook or not book.is_active:
        raise NotFree("این کتاب رایگان نیست.")
    if not is_claimable(book):
        raise NotFree("نسخه الکترونیک این کتاب هنوز آماده نیست.")
    existing = EbookEntitlement.objects.filter(
        user=user, book=book, revoked_at__isnull=True
    ).first()
    if existing is not None:
        return existing, False
    return grant(user, book, source=EbookEntitlement.Source.FREE), True
