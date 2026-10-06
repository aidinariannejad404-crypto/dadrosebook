"""ه۶: «شرح این ماده» cards — statute chapters/articles linked to paid commentary books."""

from apps.catalog.models import Book

from ..models import StatuteLink


def chapter_links(book: Book, index: int) -> list[dict]:
    links = (
        StatuteLink.objects.filter(
            book=book, chapter_index=index, is_active=True, target_book__is_active=True
        )
        .select_related("target_book")
        .prefetch_related("target_book__authors")
        .order_by("order", "id")
    )
    return [
        {
            "id": link.id,
            "anchor": link.anchor,
            "label": link.label,
            "book": {
                "slug": link.target_book.slug,
                "title": link.target_book.title,
                "authors": [p.name for p in link.target_book.authors.all()],
            },
        }
        for link in links
    ]
