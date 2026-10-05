from apps.catalog.models import Book

from ..models import Bookmark

MAX_PER_BOOK = 500


class BookmarkLimit(ValueError):
    pass


def user_bookmarks(user, book: Book):
    return Bookmark.objects.filter(user=user, book=book).order_by("page", "created_at", "id")


def add_bookmark(user, book: Book, *, page: int, location: str = "", label: str = ""):
    """Return ``(bookmark, created)``; the same page/location twice returns the existing one."""
    existing = Bookmark.objects.filter(user=user, book=book, page=page, location=location).first()
    if existing:
        return existing, False
    if Bookmark.objects.filter(user=user, book=book).count() >= MAX_PER_BOOK:
        raise BookmarkLimit("به سقف تعداد نشانک‌های این کتاب رسیده‌اید.")
    bookmark, created = Bookmark.objects.get_or_create(
        user=user, book=book, page=page, location=location, defaults={"label": label}
    )
    return bookmark, created
