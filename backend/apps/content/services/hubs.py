"""Data for the hub pages (package ب۱–ب۴): ``/exam``, ``/subject``, ``/author``, ``/publisher``.

Each builder returns ``None`` for an unknown/inactive slug, otherwise a plain dict of model
instances (serialised by ``apps.content.api.serializers``) that always carries ``indexable``,
``book_count`` and ``intro_words`` for the guardrail (``services.indexing``).
"""

from collections import Counter, defaultdict

from django.db.models import Count, F, Q, QuerySet

from apps.catalog.models import (
    Book,
    ExamType,
    Person,
    Publisher,
    StudyKitItem,
    StudyKitRecommendation,
    Subject,
)
from apps.catalog.services.books import book_card_queryset
from apps.catalog.services.courses import exposed_courses
from apps.catalog.services.home import upcoming_exam_events

from ..models import Guide
from . import indexing

BOOKS_PER_GROUP = 12
HUB_BOOK_LIMIT = 60
COURSE_LIMIT = 6
GUIDE_LIMIT = 6
TOP_AUTHORS = 8


def active_books() -> QuerySet:
    return Book.objects.filter(is_active=True)


def _cards(qs: QuerySet, exam_type: str | None = None, limit: int | None = None) -> list[Book]:
    cards = book_card_queryset(qs, exam_type=exam_type).order_by("-sales_count", "id").distinct()
    return list(cards[:limit] if limit else cards)


def _guides(**lookup) -> list[Guide]:
    return list(
        Guide.objects.published()
        .filter(**lookup)
        .select_related("author", "reviewer")
        .distinct()[:GUIDE_LIMIT]
    )


def _first_active_subject(book: Book) -> Subject | None:
    return next((s for s in book.subjects.all() if s.is_active), None)


def _intro_flags(obj, kind: str, book_count: int) -> dict:
    words = indexing.word_count(obj.intro)
    return {
        "intro_words": words,
        "indexable": indexing.is_indexable(
            kind,
            book_count=book_count,
            intro_words=words,
            intro_is_placeholder=obj.intro_is_placeholder,
        ),
    }


def _top_authors(books: QuerySet) -> list[dict]:
    """Authors of these books, most books first (links to /author pages)."""
    rows = (
        Person.objects.filter(authored_books__in=books)
        .annotate(hub_books=Count("authored_books", distinct=True))
        .order_by("-hub_books", "name")[:TOP_AUTHORS]
    )
    return [{"person": p, "book_count": p.hub_books} for p in rows]


# --- ب۱ exam hub ----------------------------------------------------------------------------------


def exam_hub(slug: str) -> dict | None:
    exam = ExamType.objects.filter(slug=slug, is_active=True).first()
    if exam is None:
        return None
    base = active_books().filter(exam_types=exam)
    books = _cards(base, exam_type=exam.slug)
    weights = dict(
        StudyKitRecommendation.objects.filter(exam_type=exam, is_active=True).values_list(
            "subject_id", "weight"
        )
    )

    grouped: dict[int | None, list[Book]] = defaultdict(list)
    subjects: dict[int, Subject] = {}
    for book in books:
        subject = _first_active_subject(book)
        if subject is not None:
            subjects[subject.id] = subject
        grouped[subject.id if subject else None].append(book)

    def kit_rank(book: Book) -> tuple:
        # essential first, then other kit books, then by sales (the list is already in sales order)
        return (not getattr(book, "kit_essential", False), not getattr(book, "kit_listed", False))

    ordered_subjects = sorted(
        subjects.values(),
        key=lambda s: (weights.get(s.id) is None, -(weights.get(s.id) or 0), s.order, s.id),
    )
    groups = [
        {
            "subject": s,
            "weight": weights.get(s.id),
            "book_count": len(grouped[s.id]),
            "books": sorted(grouped[s.id], key=kit_rank)[:BOOKS_PER_GROUP],
        }
        for s in ordered_subjects
    ]
    if grouped.get(None):
        groups.append(
            {
                "subject": None,
                "weight": None,
                "book_count": len(grouped[None]),
                "books": grouped[None][:BOOKS_PER_GROUP],
            }
        )

    kit_items = StudyKitItem.objects.filter(
        recommendation__exam_type=exam,
        recommendation__is_active=True,
        recommendation__subject__is_active=True,
        book__is_active=True,
    )
    kit = {
        "essential_count": kit_items.filter(is_essential=True).values("book").distinct().count(),
        "book_count": kit_items.values("book").distinct().count(),
        "subject_count": kit_items.values("recommendation__subject").distinct().count(),
    }
    book_count = len(books)
    return {
        "exam": exam,
        "book_count": book_count,
        **_intro_flags(exam, indexing.EXAM, book_count),
        "next_event": upcoming_exam_events().filter(exam_type=exam).first(),
        "kit": kit,
        "groups": groups,
        "courses": list(
            exposed_courses()
            .filter(exam_types=exam)
            .distinct()
            .order_by("order", "id")[:COURSE_LIMIT]
        ),
        "guides": _guides(exam_types=exam),
        "updated_at": exam.updated_at,
    }


# --- ب۲ subject hub -------------------------------------------------------------------------------


def subject_hub(slug: str) -> dict | None:
    subject = Subject.objects.filter(slug=slug, is_active=True).first()
    if subject is None:
        return None
    base = active_books().filter(subjects=subject)
    book_count = base.distinct().count()
    exams = (
        ExamType.objects.filter(is_active=True, books__in=base)
        .annotate(hub_books=Count("books", distinct=True))
        .order_by("order", "id")
    )
    return {
        "subject": subject,
        "book_count": book_count,
        **_intro_flags(subject, indexing.SUBJECT, book_count),
        "books": _cards(base, limit=HUB_BOOK_LIMIT),
        "exams": [{"exam": e, "book_count": e.hub_books} for e in exams],
        "authors": _top_authors(base),
        "courses": list(
            exposed_courses().filter(subject=subject).order_by("order", "id")[:COURSE_LIMIT]
        ),
        "guides": _guides(subjects=subject),
        "updated_at": subject.updated_at,
    }


# --- ب۳ author / translator page ------------------------------------------------------------------


def same_as_links(person: Person) -> list[str]:
    """``Person.same_as``: one https URL per line; anything else is ignored."""
    links = []
    for line in (person.same_as or "").splitlines():
        url = line.strip()
        if url.startswith("https://") and " " not in url and url not in links:
            links.append(url)
    return links


def author_hub(slug: str) -> dict | None:
    person = Person.objects.filter(slug=slug).first()
    if person is None:
        return None
    authored_qs = active_books().filter(authors=person)
    translated_qs = active_books().filter(translators=person)
    book_count = active_books().filter(Q(authors=person) | Q(translators=person)).distinct().count()
    if book_count == 0 and not person.bio.strip():
        return None  # nobody links to an empty page; 404 rather than a thin profile
    bio_words = indexing.word_count(person.bio)
    authored = _cards(authored_qs, limit=HUB_BOOK_LIMIT)
    translated = _cards(translated_qs, limit=HUB_BOOK_LIMIT)
    subject_counts: Counter = Counter()
    subject_by_id: dict[int, Subject] = {}
    for book in [*authored, *translated]:
        for s in book.subjects.all():
            if s.is_active:
                subject_counts[s.id] += 1
                subject_by_id[s.id] = s
    return {
        "person": person,
        "same_as": same_as_links(person),
        "book_count": book_count,
        "bio_words": bio_words,
        "indexable": indexing.is_indexable(
            indexing.AUTHOR, book_count=book_count, bio_words=bio_words
        ),
        "authored": authored,
        "translated": translated,
        "subjects": [subject_by_id[sid] for sid, _ in subject_counts.most_common()],
        "guides_written": _guides(author=person),
        "guides_reviewed": _guides(reviewer=person),
        "updated_at": person.updated_at,
    }


# --- ب۴ publisher page ----------------------------------------------------------------------------


def publisher_hub(slug: str) -> dict | None:
    publisher = Publisher.objects.filter(slug=slug).first()
    if publisher is None:
        return None
    base = active_books().filter(publisher=publisher)
    book_count = base.count()
    if book_count == 0:
        return None
    subjects = (
        Subject.objects.filter(is_active=True, books__in=base)
        .annotate(hub_books=Count("books", distinct=True))
        .order_by(F("hub_books").desc(), "order")
    )
    return {
        "publisher": publisher,
        "book_count": book_count,
        "intro_words": indexing.word_count(publisher.intro),
        "indexable": indexing.is_indexable(indexing.PUBLISHER, book_count=book_count),
        "books": _cards(base, limit=HUB_BOOK_LIMIT),
        "subjects": list(subjects),
        "authors": _top_authors(base),
        "updated_at": publisher.updated_at,
    }
