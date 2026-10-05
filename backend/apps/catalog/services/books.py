"""Book querysets shared by the API, home page and study kits."""

from collections.abc import Iterable

from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet, Subquery

from ..models import (
    Book,
    BookCourse,
    BookSamplePage,
    BookVariant,
    Category,
    ExamType,
    Person,
    RelatedCourse,
    StudyKitItem,
    Subject,
)
from .pricing import min_effective_price_expression
from .ratings import rating_annotations
from .social_proof import books_ahead_in_subject_expression, first_subject_expression

COURSE_SOURCE_RELEVANCE = (BookCourse.Relevance.REFERENCED, BookCourse.Relevance.SAME_AUTHOR)


def active_variants_qs() -> QuerySet:
    return BookVariant.objects.filter(is_active=True).order_by("id")


def card_prefetches() -> list[Prefetch]:
    """Prefetches needed to render a ``BookCard`` without extra queries."""
    return [
        Prefetch("authors", queryset=Person.objects.order_by("name", "id")),
        Prefetch("subjects", queryset=Subject.objects.order_by("order", "id")),
        Prefetch("exam_types", queryset=ExamType.objects.order_by("order", "id")),
        Prefetch("variants", queryset=active_variants_qs(), to_attr="active_variants"),
    ]


def in_stock_expression():
    return Exists(
        BookVariant.objects.filter(book=OuterRef("pk"), is_active=True).filter(
            Q(type=BookVariant.Type.EBOOK) | Q(stock__gt=0)
        )
    )


def has_sample_pages_expression():
    return Exists(BookSamplePage.objects.filter(book=OuterRef("pk")))


def has_sample_q() -> Q:
    """Books with a sample PDF or sample pages (needs the ``has_sample_pages`` annotation)."""
    return Q(has_sample_pages=True) | ~Q(sample_pdf="")


def first_course_title_expression():
    """Title of the first exposed course taught from this book or by its author (link order).

    Same-subject links do not count: «منبع دوره دادرُز» must be true.
    """
    return Subquery(
        BookCourse.objects.filter(
            book=OuterRef("pk"),
            relevance__in=COURSE_SOURCE_RELEVANCE,
            course__in=RelatedCourse.objects.exposed(),
        )
        .order_by("order", "id")
        .values("course__title")[:1]
    )


def kit_role_annotations(exam_type: str) -> dict:
    """``kit_listed``/``kit_essential`` for the active study kits of one exam type (slug)."""
    items = StudyKitItem.objects.filter(
        book=OuterRef("pk"),
        recommendation__is_active=True,
        recommendation__exam_type__slug=exam_type,
        recommendation__exam_type__is_active=True,
        recommendation__subject__is_active=True,
    )
    return {"kit_listed": Exists(items), "kit_essential": Exists(items.filter(is_essential=True))}


def book_card_queryset(base: QuerySet | None = None, *, exam_type: str | None = None) -> QuerySet:
    """Active books with everything a ``BookCard`` needs, without per-book queries.

    Annotations: ``min_price`` (non-placeholder), ``has_stock``, ``has_sample_pages``,
    ``first_course_title``, ``first_subject_id``, ``books_ahead_in_subject``,
    ``approved_rating_avg``/``approved_rating_count`` and, when ``exam_type`` (a slug) is
    given, ``kit_listed``/``kit_essential`` for that exam's kits.
    """
    qs = base if base is not None else Book.objects.all()
    qs = (
        qs.filter(is_active=True)
        .annotate(
            min_price=min_effective_price_expression(),
            has_stock=in_stock_expression(),
            has_sample_pages=has_sample_pages_expression(),
            first_course_title=first_course_title_expression(),
            first_subject_id=first_subject_expression(),
            **rating_annotations(),
        )
        .annotate(books_ahead_in_subject=books_ahead_in_subject_expression())
    )
    if exam_type:
        qs = qs.annotate(**kit_role_annotations(exam_type))
    return qs.prefetch_related(*card_prefetches())


def sorted_variants(variants: Iterable[BookVariant]) -> list[BookVariant]:
    return sorted(variants, key=lambda v: BookVariant.TYPE_ORDER.get(v.type, 99))


def category_descendant_ids(slugs: Iterable[str]) -> set[int]:
    """IDs of the categories with these slugs and all of their descendants (one query)."""
    rows = list(Category.objects.filter(is_active=True).values_list("id", "parent_id", "slug"))
    children: dict[int | None, list[int]] = {}
    for cid, parent_id, _ in rows:
        children.setdefault(parent_id, []).append(cid)
    wanted = set(slugs)
    stack = [cid for cid, _, slug in rows if slug in wanted]
    result: set[int] = set()
    while stack:
        cid = stack.pop()
        if cid in result:
            continue
        result.add(cid)
        stack.extend(children.get(cid, []))
    return result


def category_tree(categories: Iterable[Category]) -> list[dict]:
    """Build ``[{"category": c, "children": [...]}]`` from a flat, ordered list of categories."""
    nodes = {c.id: {"category": c, "children": []} for c in categories}
    roots = []
    for c in categories:
        node = nodes[c.id]
        if c.parent_id and c.parent_id in nodes:
            nodes[c.parent_id]["children"].append(node)
        elif not c.parent_id:
            roots.append(node)
    return roots


def active_category_tree() -> list[dict]:
    return category_tree(list(Category.objects.filter(is_active=True).order_by("order", "id")))
