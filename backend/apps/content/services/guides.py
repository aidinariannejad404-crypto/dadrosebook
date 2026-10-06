"""Editorial guides (package ب۵) and curated lists (ب۶)."""

import uuid

from django.db.models import Prefetch
from django.utils import timezone

from apps.catalog.models import Book, ExamType, Subject
from apps.catalog.services.books import book_card_queryset

from ..models import CuratedList, CuratedListItem, Guide
from . import indexing

GUIDE_BOOK_LIMIT = 24


def _valid_uuid(value: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


def get_guide(slug: str, preview_key: str | None = None) -> Guide | None:
    """A published guide, or a draft when ``preview_key`` matches (staff preview links)."""
    qs = Guide.objects.select_related("author", "reviewer").prefetch_related(
        Prefetch("exam_types", queryset=ExamType.objects.filter(is_active=True)),
        Prefetch("subjects", queryset=Subject.objects.filter(is_active=True)),
    )
    guide = qs.filter(slug=slug).first()
    if guide is None:
        return None
    if guide.is_published:
        return guide
    key = _valid_uuid(preview_key)
    return guide if key is not None and key == guide.preview_key else None


def guide_books(guide: Guide) -> list[Book]:
    return list(
        book_card_queryset(Book.objects.filter(guides=guide)).order_by("-sales_count", "id")[
            :GUIDE_BOOK_LIMIT
        ]
    )


def guide_is_indexable(guide: Guide) -> bool:
    """Published guides with a real body; previews of drafts never are."""
    return guide.is_published and indexing.word_count(guide.body) > 0


def published_guides():
    return Guide.objects.published().select_related("author", "reviewer")


# --- ب۶ curated lists -----------------------------------------------------------------------------


def list_is_expired(curated: CuratedList, today=None) -> bool:
    today = today or timezone.localdate()
    return curated.ends_on is not None and curated.ends_on < today


def get_curated_list(slug: str) -> CuratedList | None:
    items = CuratedListItem.objects.filter(book__is_active=True).order_by("order", "id")
    curated = CuratedList.objects.visible().filter(slug=slug).first()
    if curated is None:
        return None
    curated.list_items = list(items.filter(curated_list=curated))
    by_id = {
        b.id: b for b in book_card_queryset(Book.objects.filter(list_items__curated_list=curated))
    }
    curated.ordered_entries = [
        {"book": by_id[item.book_id], "note": item.note}
        for item in curated.list_items
        if item.book_id in by_id
    ]
    return curated


def curated_list_flags(curated: CuratedList, book_count: int) -> dict:
    words = indexing.word_count(curated.intro)
    expired = list_is_expired(curated)
    return {
        "intro_words": words,
        "is_expired": expired,
        "indexable": not expired
        and indexing.is_indexable(indexing.LIST, book_count=book_count, intro_words=words),
    }
