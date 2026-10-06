"""Normalised Persian search over ``Book.search_text``.

``search_text`` holds the normalised title, subtitle, authors, translators, publisher, subjects and
ISBN (with ZWNJ/space/compact variants, see ``apps.core.normalize.search_variants``). Queries are
normalised the same way and every token must be contained in ``search_text``.
"""

from functools import reduce
from operator import add, or_

from django.db.models import Case, ExpressionWrapper, IntegerField, Q, QuerySet, Value, When

from apps.core.normalize import search_variants, tokenize_query


def build_search_text(book) -> str:
    parts: list[str] = [book.title, book.subtitle, book.isbn]
    if book.publisher_id:
        parts.append(book.publisher.name)
    if book.pk:
        parts.extend(p.name for p in book.authors.all())
        parts.extend(p.name for p in book.translators.all())
        parts.extend(s.name for s in book.subjects.all())
    return " | ".join(v for v in (search_variants(p) for p in parts if p) if v)


def refresh_search_text(book) -> str:
    """Recompute and store ``book.search_text`` without calling ``save()`` (no signal loops)."""
    text = build_search_text(book)
    if text != book.search_text:
        book.search_text = text
        type(book).objects.filter(pk=book.pk).update(search_text=text)
    return text


def refresh_books(books) -> None:
    for book in books:
        refresh_search_text(book)


def search_books(queryset: QuerySet, q: str | None) -> QuerySet:
    """Filter ``queryset`` so every normalised token of ``q`` appears in ``search_text``."""
    for token in tokenize_query(q):
        queryset = queryset.filter(search_text__contains=token)
    return queryset


def should_relax(q: str | None) -> bool:
    """Only multi-token queries get the any-token fallback (one token has nothing to relax)."""
    return len(tokenize_query(q)) > 1


def search_books_relaxed(queryset: QuerySet, q: str | None) -> QuerySet:
    """Books whose ``search_text`` contains *any* token of ``q``, best match first.

    Annotates ``matched_tokens`` (how many distinct tokens matched) and orders by it, descending,
    ahead of the queryset's existing ordering. Used by the list when ``search_books`` finds nothing.
    """
    tokens = list(dict.fromkeys(tokenize_query(q)))
    if not tokens:
        return queryset
    matched = reduce(
        add,
        [Case(When(search_text__contains=t, then=Value(1)), default=Value(0)) for t in tokens],
    )
    existing = list(queryset.query.order_by) or ["id"]
    return (
        queryset.filter(reduce(or_, [Q(search_text__contains=t) for t in tokens]))
        .annotate(matched_tokens=ExpressionWrapper(matched, output_field=IntegerField()))
        .order_by("-matched_tokens", *existing)
    )
