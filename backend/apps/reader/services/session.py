"""The payload of ``GET /library/<slug>/read/``."""

from django.utils import timezone

from apps.catalog.models import Book
from apps.core.jalali import to_jalali_str

from .access import active_file, require_access
from .progress import get_progress
from .signing import signed_url


def mask_phone(phone: str) -> str:
    """``09121234567`` → ``0912***4567``."""
    if len(phone) < 8:
        return phone
    return f"{phone[:4]}***{phone[-4:]}"


def watermark_text(user) -> str:
    return f"{mask_phone(user.phone)} · {to_jalali_str(timezone.localdate(), persian_digits=True)}"


def reader_session(request, user, book: Book) -> dict:
    require_access(user, book)
    ebook = active_file(book)
    url = signed_url(request, ebook, user)
    return {
        "book": book,
        "file": {
            "format": ebook.format,
            "version": ebook.version,
            "url": url.url,
            "expires_at": url.expires_at,
        },
        "progress": get_progress(user, book),
        "watermark": watermark_text(user),
    }
