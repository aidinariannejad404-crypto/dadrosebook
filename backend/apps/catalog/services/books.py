"""Book querysets shared by the API, home page and study kits."""

from collections.abc import Iterable

from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet

from ..models import Book, BookVariant, Category, ExamType, Person, Subject
from .pricing import min_effective_price_expression


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


def book_card_queryset(base: QuerySet | None = None) -> QuerySet:
    """Active books annotated with ``min_price``/``has_stock`` and card prefetches."""
    qs = base if base is not None else Book.objects.all()
    return (
        qs.filter(is_active=True)
        .annotate(min_price=min_effective_price_expression(), has_stock=in_stock_expression())
        .prefetch_related(*card_prefetches())
    )


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
