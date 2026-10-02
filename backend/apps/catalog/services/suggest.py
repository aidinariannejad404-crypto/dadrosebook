"""Header autocomplete (``GET /catalog/search/suggest/``).

The query is normalised like the list's ``q`` (``tokenize_query``); a name matches when it contains
every token in any of its ``search_variants`` spellings
(so ZWNJ, space and joined forms find each other).
Subject, category and author tables are small, so names are normalised in Python.
"""

import hashlib

from apps.core.normalize import search_variants, tokenize_query

from ..models import Book, Category, Person, Subject
from .books import card_prefetches
from .search import search_books

DISCOVERY_CACHE_SECONDS = 60
MIN_QUERY_LENGTH = 2
BOOK_LIMIT = 6
NAME_LIMIT = 4


def normalize_query(q: str | None) -> str:
    return " ".join(tokenize_query(q))


def suggest_cache_key(normalized_q: str) -> str:
    digest = hashlib.sha256(normalized_q.encode()).hexdigest()
    return f"catalog:suggest:{digest}"


def _name_matches(name: str, tokens: list[str]) -> bool:
    variants = search_variants(name)
    return all(token in variants for token in tokens)


def _matching(objects, tokens: list[str], limit: int) -> list:
    return [obj for obj in objects if _name_matches(obj.name, tokens)][:limit]


def search_suggestions(q: str | None) -> dict:
    """``{"q", "books", "subjects", "categories", "authors"}`` with model instances.

    ``q`` shorter than ``MIN_QUERY_LENGTH`` characters (spaces ignored) gives empty lists.
    """
    normalized = normalize_query(q)
    result = {"q": normalized, "books": [], "subjects": [], "categories": [], "authors": []}
    if len(normalized.replace(" ", "")) < MIN_QUERY_LENGTH:
        return result
    tokens = normalized.split(" ")
    books = search_books(Book.objects.filter(is_active=True), normalized)
    result["books"] = list(
        books.order_by("-sales_count", "id").prefetch_related(*card_prefetches())[:BOOK_LIMIT]
    )
    result["subjects"] = _matching(
        Subject.objects.filter(is_active=True).order_by("order", "id"), tokens, NAME_LIMIT
    )
    result["categories"] = _matching(
        Category.objects.filter(is_active=True).order_by("order", "id"), tokens, NAME_LIMIT
    )
    result["authors"] = _matching(
        Person.objects.filter(authored_books__is_active=True).distinct().order_by("name", "id"),
        tokens,
        NAME_LIMIT,
    )
    return result
