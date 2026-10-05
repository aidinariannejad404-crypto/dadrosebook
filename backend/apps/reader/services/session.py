"""The payload of ``GET /library/<slug>/read/`` and of one EPUB chapter."""

import datetime as dt
from html import escape

from django.conf import settings
from django.utils import timezone

from apps.catalog.models import Book
from apps.core.jalali import to_jalali_str
from apps.library.models import EbookFile

from ..models import EpubPackage
from .access import NoEbook, active_file, require_access
from .epub import ASSET_RE, get_package
from .progress import get_progress
from .quota import quota
from .signing import asset_url, signed_url, ttl_seconds


def mask_phone(phone: str) -> str:
    """``09121234567`` → ``0912***4567``."""
    if len(phone) < 8:
        return phone
    return f"{phone[:4]}***{phone[-4:]}"


def watermark_text(user) -> str:
    return f"{mask_phone(user.phone)} · {to_jalali_str(timezone.localdate(), persian_digits=True)}"


def copy_limit() -> int:
    return int(getattr(settings, "READER_COPY_LIMIT", 1000))


def epub_info(package: EpubPackage) -> dict:
    chapters = package.chapters.only("index", "title", "start_page", "pages", "chars")
    return {
        "language": package.language,
        "direction": package.direction,
        "total_pages": package.total_pages,
        "chapters": [
            {
                "index": c.index,
                "title": c.title,
                "start_page": c.start_page,
                "pages": c.pages,
                "chars": c.chars,
            }
            for c in chapters
        ],
        "toc": package.toc,
    }


def reader_session(request, user, book: Book, device=None) -> dict:
    from .offline import offline_info  # offline builds on this module

    require_access(user, book)
    ebook = active_file(book)
    epub = None
    if ebook.format == EbookFile.Format.EPUB:
        epub = epub_info(get_package(ebook))
        file = {
            "format": ebook.format,
            "version": ebook.version,
            "url": "",  # nothing to download: chapters are streamed one by one
            "expires_at": timezone.now() + dt.timedelta(seconds=ttl_seconds()),
        }
    else:
        url = signed_url(request, ebook, user)
        file = {
            "format": ebook.format,
            "version": ebook.version,
            "url": url.url,
            "expires_at": url.expires_at,
        }
    return {
        "book": book,
        "file": file,
        "progress": get_progress(user, book),
        "watermark": watermark_text(user),
        "copy_limit": copy_limit(),
        "copy_quota": quota(user, book),
        "epub": epub,
        "offline": offline_info(user, book, ebook, device),
    }


def epub_package_for(user, book: Book) -> EpubPackage:
    require_access(user, book)
    ebook = active_file(book)
    if ebook.format != EbookFile.Format.EPUB:
        raise NoEbook
    return get_package(ebook)


def chapter_payload(user, package: EpubPackage, index: int) -> dict:
    chapter = package.chapters.filter(index=index).first()
    if chapter is None:
        raise NoEbook
    assets = {a.pk: a for a in package.assets.all()} if "/__asset__/" in chapter.html else {}

    def sign(match):
        asset = assets.get(int(match.group(1)))
        return f'src="{escape(asset_url(asset, user))}"' if asset else 'src=""'

    last = package.chapters.count() - 1
    return {
        "index": chapter.index,
        "title": chapter.title,
        "start_page": chapter.start_page,
        "pages": chapter.pages,
        "chars": chapter.chars,
        "prev": chapter.index - 1 if chapter.index > 0 else None,
        "next": chapter.index + 1 if chapter.index < last else None,
        "html": ASSET_RE.sub(sign, chapter.html),
    }
