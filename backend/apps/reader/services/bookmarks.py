from apps.catalog.models import Book

from ..models import Bookmark

MAX_PER_BOOK = 500


class BookmarkLimit(ValueError):
    pass


def user_bookmarks(user, book: Book):
    return Bookmark.objects.filter(user=user, book=book).order_by("page", "created_at", "id")


def add_bookmark(
    user,
    book: Book,
    *,
    page: int,
    location: str = "",
    label: str = "",
    ebook_version: int | None = None,
):
    """Return ``(bookmark, created)``; the same page/location twice returns the existing one."""
    from .reanchor import stamp_pdf_bookmark, stamp_point

    existing = Bookmark.objects.filter(user=user, book=book, page=page, location=location).first()
    if existing:
        return existing, False
    if Bookmark.objects.filter(user=user, book=book).count() >= MAX_PER_BOOK:
        raise BookmarkLimit("به سقف تعداد نشانک‌های این کتاب رسیده‌اید.")
    anchor = stamp_point(book, page=page, location=location, version=ebook_version)
    if not location:
        anchor.update(stamp_pdf_bookmark(book, page=page, version=ebook_version))
    bookmark, created = Bookmark.objects.get_or_create(
        user=user, book=book, page=page, location=location, defaults={"label": label, **anchor}
    )
    if created and ebook_version:
        from .highlights import queue_if_stale

        queue_if_stale(book, ebook_version)
    return bookmark, created
