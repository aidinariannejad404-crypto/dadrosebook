"""Total copy quota per user and book (Kindle-style «clipping limit»).

EPUB: ``READER_COPY_QUOTA_PERCENT`` (10) percent of the book's characters, at least
``READER_COPY_QUOTA_MIN``. PDF (characters unknown): ``READER_PDF_COPY_QUOTA``. The reader truncates
before writing the clipboard and reports each copy here; the ledger is shared by all devices.
"""

from django.conf import settings
from django.db import transaction
from django.db.models import F

from apps.catalog.models import Book
from apps.library.models import EbookFile

from ..models import CopyLedger, EpubPackage


def quota_limit(book: Book) -> int:
    ebook = EbookFile.objects.filter(book=book, is_active=True).order_by("-version").first()
    package = (
        EpubPackage.objects.filter(ebook=ebook).only("total_chars").first()
        if ebook is not None and ebook.format == EbookFile.Format.EPUB
        else None
    )
    if package is None:
        return int(getattr(settings, "READER_PDF_COPY_QUOTA", 20000))
    percent = int(getattr(settings, "READER_COPY_QUOTA_PERCENT", 10))
    minimum = int(getattr(settings, "READER_COPY_QUOTA_MIN", 2000))
    return max(minimum, package.total_chars * percent // 100)


def used(user, book: Book) -> int:
    ledger = CopyLedger.objects.filter(user=user, book=book).only("used").first()
    return ledger.used if ledger else 0


def quota(user, book: Book) -> dict:
    return {"limit": quota_limit(book), "used": used(user, book)}


def record_copy(user, book: Book, chars: int) -> dict:
    """Spend up to ``chars`` of the quota; returns ``{limit, used, granted}``."""
    limit = quota_limit(book)
    chars = max(0, int(chars))
    with transaction.atomic():
        ledger, _ = CopyLedger.objects.select_for_update().get_or_create(user=user, book=book)
        granted = min(chars, max(0, limit - ledger.used))
        if granted:
            CopyLedger.objects.filter(pk=ledger.pk).update(used=F("used") + granted)
            ledger.refresh_from_db(fields=["used"])
    return {"limit": limit, "used": ledger.used, "granted": granted}
