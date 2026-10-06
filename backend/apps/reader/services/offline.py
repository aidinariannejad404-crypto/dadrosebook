"""Offline reading licenses for EPUB books.

Trade-off (see docs/ebook-platform-summary.md): an offline package holds every chapter of the
book on the device, so it gives up chapter-by-chapter streaming for that device. It is limited to
``READER_OFFLINE_MAX_BOOKS`` live licenses per user, each bound to one registered device, expires
after ``READER_OFFLINE_DAYS`` days, re-checks the entitlement on every online open and is logged.
Turn it off with ``READER_OFFLINE_ENABLED=false``.
"""

import base64
import datetime as dt

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Book
from apps.library.models import EbookFile

from ..models import EpubPackage, OfflineLicense, ReaderDevice
from .access import ReaderError, active_file, require_access
from .epub import ASSET_RE, get_package
from .quota import quota
from .session import copy_limit, epub_info, watermark_text


class OfflineDisabled(ReaderError):
    status = 404
    code = "offline_disabled"
    message = "مطالعه آفلاین برای این کتاب فعال نیست."


class OfflineLimit(ReaderError):
    status = 409
    code = "offline_limit"
    message = "به سقف کتاب‌های آفلاین رسیده‌اید. یکی از کتاب‌های آفلاین را حذف کنید."

    def __init__(self, licenses=()):
        super().__init__(self.message)
        self.licenses = list(licenses)


def enabled() -> bool:
    return bool(getattr(settings, "READER_OFFLINE_ENABLED", True))


def max_books() -> int:
    return int(getattr(settings, "READER_OFFLINE_MAX_BOOKS", 3))


def days() -> int:
    return int(getattr(settings, "READER_OFFLINE_DAYS", 14))


def live_licenses(user):
    return (
        OfflineLicense.objects.filter(
            user=user, revoked_at__isnull=True, expires_at__gt=timezone.now()
        )
        .select_related("book", "device")
        .order_by("-created_at")
    )


def offline_info(user, book: Book, ebook: EbookFile, device: ReaderDevice | None) -> dict | None:
    if not enabled() or ebook.format != EbookFile.Format.EPUB:
        return None
    license_ = live_licenses(user).filter(book=book, device=device).first() if device else None
    return {"max_books": max_books(), "days": days(), "license": license_}


def _inline_images(package: EpubPackage, html: str, assets: dict) -> str:
    def inline(match):
        asset = assets.get(int(match.group(1)))
        if asset is None:
            return 'src=""'
        with asset.file.open("rb") as fh:
            data = base64.b64encode(fh.read()).decode()
        return f'src="data:{asset.media_type};base64,{data}"'

    return ASSET_RE.sub(inline, html)


def issue(user, book: Book, device: ReaderDevice) -> tuple[OfflineLicense, dict, bool]:
    """Create or renew the license for (user, book, device); return it with the package."""
    if not enabled():
        raise OfflineDisabled
    require_access(user, book)
    ebook = active_file(book)
    if ebook.format != EbookFile.Format.EPUB:
        raise OfflineDisabled
    package = get_package(ebook)
    expires = timezone.now() + dt.timedelta(days=days())
    with transaction.atomic():
        existing = (
            OfflineLicense.objects.select_for_update()
            .filter(user=user, book=book, device=device)
            .first()
        )
        is_live = (
            existing is not None
            and existing.revoked_at is None
            and existing.expires_at > timezone.now()
        )
        if not is_live:
            others = live_licenses(user)
            if others.count() >= max_books():
                raise OfflineLimit(others)
        if existing is None:
            license_ = OfflineLicense.objects.create(
                user=user, book=book, device=device, expires_at=expires
            )
            created = True
        else:
            existing.expires_at = expires
            existing.revoked_at = None
            existing.save(update_fields=["expires_at", "revoked_at"])
            license_, created = existing, not is_live
    assets = {a.pk: a for a in package.assets.all()}
    chapters = []
    rows = package.chapters.order_by("index")
    last = len(rows) - 1
    for c in rows:
        chapters.append(
            {
                "index": c.index,
                "title": c.title,
                "start_page": c.start_page,
                "pages": c.pages,
                "chars": c.chars,
                "prev": c.index - 1 if c.index > 0 else None,
                "next": c.index + 1 if c.index < last else None,
                "html": _inline_images(package, c.html, assets),
            }
        )
    payload = {
        "epub": epub_info(package),
        "chapters": chapters,
        "watermark": watermark_text(user),
        "copy_limit": copy_limit(),
        "copy_quota": quota(user, book),
    }
    return license_, payload, created


def revoke(user, license_id: int) -> bool:
    return bool(
        OfflineLicense.objects.filter(user=user, pk=license_id, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
    )
