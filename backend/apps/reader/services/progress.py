from apps.catalog.models import Book

from ..models import ReadingProgress


def get_progress(user, book: Book) -> ReadingProgress | None:
    return ReadingProgress.objects.filter(user=user, book=book).first()


def save_progress(user, book: Book, *, page: int, total_pages: int, location: str = ""):
    page = max(1, page)
    if total_pages:
        page = min(page, total_pages)
    progress, _ = ReadingProgress.objects.update_or_create(
        user=user,
        book=book,
        defaults={"page": page, "total_pages": total_pages, "location": location},
    )
    return progress
