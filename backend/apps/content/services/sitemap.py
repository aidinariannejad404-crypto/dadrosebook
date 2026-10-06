"""Indexable hub / guide / list URLs for ``GET /seo/sitemap/`` (package ب, sitemap split).

Only pages that pass the guardrail (``services.indexing``) are listed; ``updated_at`` is the later
of the entity row and its newest active book, so a price/edition change refreshes ``lastmod``.
"""

import datetime as dt
from collections import defaultdict

from django.db.models import Count, Max, Q
from django.utils import timezone

from apps.catalog.models import Book, ExamType, Person, Publisher, Subject

from ..models import CuratedList, CuratedListItem, Guide
from . import indexing
from .guides import guide_is_indexable, list_is_expired


def _iso(value: dt.datetime) -> str:
    return value.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _latest(*values):
    return max(v for v in values if v is not None)


def _intro_hubs(model, kind: str) -> list[dict]:
    rows = (
        model.objects.filter(is_active=True)
        .annotate(
            hub_books=Count("books", filter=Q(books__is_active=True), distinct=True),
            books_updated=Max("books__updated_at", filter=Q(books__is_active=True)),
        )
        .order_by("slug")
    )
    return [
        {"slug": obj.slug, "updated_at": _iso(_latest(obj.updated_at, obj.books_updated))}
        for obj in rows
        if indexing.is_indexable(
            kind,
            book_count=obj.hub_books,
            intro_words=indexing.word_count(obj.intro),
            intro_is_placeholder=obj.intro_is_placeholder,
        )
    ]


def indexable_exams() -> list[dict]:
    return _intro_hubs(ExamType, indexing.EXAM)


def indexable_subjects() -> list[dict]:
    return _intro_hubs(Subject, indexing.SUBJECT)


def indexable_authors() -> list[dict]:
    """Authors and translators: one query per role, books counted once per person."""
    books: dict[int, set[int]] = defaultdict(set)
    newest: dict[int, dt.datetime] = {}
    for through in (Book.authors.through, Book.translators.through):
        for person_id, book_id, updated in through.objects.filter(book__is_active=True).values_list(
            "person_id", "book_id", "book__updated_at"
        ):
            books[person_id].add(book_id)
            newest[person_id] = _latest(newest.get(person_id), updated)
    out = []
    for person in Person.objects.filter(id__in=books.keys()).order_by("slug"):
        count = len(books[person.id])
        if indexing.is_indexable(
            indexing.AUTHOR, book_count=count, bio_words=indexing.word_count(person.bio)
        ):
            out.append(
                {
                    "slug": person.slug,
                    "updated_at": _iso(_latest(person.updated_at, newest[person.id])),
                }
            )
    return out


def indexable_publishers() -> list[dict]:
    rows = (
        Publisher.objects.annotate(
            hub_books=Count("books", filter=Q(books__is_active=True), distinct=True),
            books_updated=Max("books__updated_at", filter=Q(books__is_active=True)),
        )
        .filter(hub_books__gt=0)
        .order_by("slug")
    )
    return [
        {"slug": p.slug, "updated_at": _iso(_latest(p.updated_at, p.books_updated))}
        for p in rows
        if indexing.is_indexable(indexing.PUBLISHER, book_count=p.hub_books)
    ]


def indexable_guides() -> list[dict]:
    return [
        {"slug": g.slug, "updated_at": _iso(g.updated_at)}
        for g in Guide.objects.published().order_by("slug")
        if guide_is_indexable(g)
    ]


def indexable_lists() -> list[dict]:
    today = timezone.localdate()
    counts = dict(
        CuratedListItem.objects.filter(book__is_active=True)
        .values("curated_list")
        .annotate(n=Count("book", distinct=True))
        .values_list("curated_list", "n")
    )
    out = []
    for curated in CuratedList.objects.visible().order_by("slug"):
        if list_is_expired(curated, today):
            continue
        if indexing.is_indexable(
            indexing.LIST,
            book_count=counts.get(curated.id, 0),
            intro_words=indexing.word_count(curated.intro),
        ):
            out.append({"slug": curated.slug, "updated_at": _iso(curated.updated_at)})
    return out


def hub_sitemap_data() -> dict:
    return {
        "exam_types": indexable_exams(),
        "subjects": indexable_subjects(),
        "authors": indexable_authors(),
        "publishers": indexable_publishers(),
        "guides": indexable_guides(),
        "lists": indexable_lists(),
    }
