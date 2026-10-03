"""Facet counts for the book list (``GET /catalog/books/facets/``).

Every facet is counted on the list's result set with **that facet's own filter removed** (so the
user can switch within a facet) and every other filter applied. Filtering reuses ``BookFilter`` so
the semantics match ``GET /catalog/books/`` exactly.
"""

from django.db.models import Count, Max, Min, Q, QuerySet

from ..api.filters import BookFilter
from ..models import Book, BookVariant, ExamType, Subject
from .books import has_sample_pages_expression, in_stock_expression
from .pricing import min_effective_price_expression
from .search import search_books_relaxed, should_relax

# List params that do not narrow the result set.
IGNORED_PARAMS = ("page", "page_size", "ordering")
# Each facet and the list params it owns (removed when counting that facet).
FACET_PARAMS = {
    "subjects": ("subject",),
    "exam_types": ("exam_type",),
    "formats": ("format",),
    "resource_types": ("resource_type",),
    "in_stock": ("in_stock",),
    "price": ("min_price", "max_price"),
}


def facet_base_queryset() -> QuerySet:
    """Active books with the annotations ``BookFilter`` needs (no card prefetches)."""
    return Book.objects.filter(is_active=True).annotate(
        min_price=min_effective_price_expression(),
        has_stock=in_stock_expression(),
        has_sample_pages=has_sample_pages_expression(),
    )


def filtered_ids(params, *, without: tuple[str, ...] = (), relaxed: bool = False) -> QuerySet:
    """``pk`` values of active books matching ``params`` minus the ``without`` keys.

    ``relaxed``: ``q`` matches books containing *any* of its tokens (the list's fallback when
    every token together finds nothing).
    """
    data = params.copy()
    for key in (*IGNORED_PARAMS, *without):
        data.pop(key, None)
    q = data.pop("q", [""])[-1] if relaxed else None
    qs = BookFilter(data=data, queryset=facet_base_queryset()).qs
    if relaxed:
        qs = search_books_relaxed(qs, q)
    return qs.order_by().values("pk")


def _subject_facet(ids: QuerySet) -> list[dict]:
    subjects = (
        Subject.objects.filter(is_active=True)
        .annotate(count=Count("books", filter=_book_in(ids), distinct=True))
        .filter(count__gt=0)
        .order_by("order", "id")
    )
    return [{"slug": s.slug, "name": s.name, "color": s.color, "count": s.count} for s in subjects]


def _exam_type_facet(ids: QuerySet) -> list[dict]:
    exam_types = (
        ExamType.objects.filter(is_active=True)
        .annotate(count=Count("books", filter=_book_in(ids), distinct=True))
        .filter(count__gt=0)
        .order_by("order", "id")
    )
    return [{"slug": e.slug, "name": e.name, "count": e.count} for e in exam_types]


def _book_in(ids: QuerySet) -> Q:
    return Q(books__in=ids)


def _format_facet(ids: QuerySet) -> list[dict]:
    counts = dict(
        BookVariant.objects.filter(is_active=True, book__in=ids)
        .values_list("type")
        .annotate(n=Count("book", distinct=True))
        .order_by()
    )
    return [
        {"value": value, "label": label, "count": counts[value]}
        for value, label in BookVariant.Type.choices
        if counts.get(value)
    ]


def _resource_type_facet(ids: QuerySet) -> list[dict]:
    counts = dict(
        Book.objects.filter(pk__in=ids)
        .values_list("resource_type")
        .annotate(n=Count("pk"))
        .order_by()
    )
    return [
        {"value": value, "label": label, "count": counts[value]}
        for value, label in Book.ResourceType.choices
        if counts.get(value)
    ]


def _in_stock_facet(ids: QuerySet) -> int:
    return facet_base_queryset().filter(pk__in=ids, has_stock=True).count()


def _price_facet(ids: QuerySet) -> dict:
    """Range of non-placeholder ``min_price`` (books with only placeholder prices are ignored)."""
    agg = (
        facet_base_queryset()
        .filter(pk__in=ids, min_price__isnull=False)
        .aggregate(lo=Min("min_price"), hi=Max("min_price"))
    )
    return {"min": agg["lo"], "max": agg["hi"]}


def book_facets(params) -> dict:
    """Facet payload for a ``QueryDict`` of list params (see ``docs/api-contract-phase-2.md``)."""
    count = Book.objects.filter(pk__in=filtered_ids(params)).count()
    relaxed = count == 0 and should_relax(params.get("q"))
    if relaxed:
        count = Book.objects.filter(pk__in=filtered_ids(params, relaxed=True)).count()

    def ids(facet: str) -> QuerySet:
        return filtered_ids(params, without=FACET_PARAMS[facet], relaxed=relaxed)

    return {
        "count": count,
        "subjects": _subject_facet(ids("subjects")),
        "exam_types": _exam_type_facet(ids("exam_types")),
        "formats": _format_facet(ids("formats")),
        "resource_types": _resource_type_facet(ids("resource_types")),
        "in_stock": _in_stock_facet(ids("in_stock")),
        "price": _price_facet(ids("price")),
    }
