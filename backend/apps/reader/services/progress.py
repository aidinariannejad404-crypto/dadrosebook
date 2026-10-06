from apps.catalog.models import Book

from ..models import ReadingProgress


def get_progress(user, book: Book) -> ReadingProgress | None:
    return ReadingProgress.objects.filter(user=user, book=book).first()


def save_progress(
    user,
    book: Book,
    *,
    page: int,
    total_pages: int,
    location: str = "",
    ebook_version: int | None = None,
):
    from .reanchor import stamp_point

    page = max(1, page)
    if total_pages:
        page = min(page, total_pages)
    anchor = stamp_point(book, page=page, location=location, version=ebook_version)
    anchor.pop("context_before", None)
    progress, _ = ReadingProgress.objects.update_or_create(
        user=user,
        book=book,
        defaults={
            "page": page,
            "total_pages": total_pages,
            "location": location,
            "ebook_version": anchor.get("ebook_version"),
            "context_after": anchor.get("context_after", ""),
        },
    )
    if ebook_version:
        from .highlights import queue_if_stale

        queue_if_stale(book, ebook_version)
    return progress
