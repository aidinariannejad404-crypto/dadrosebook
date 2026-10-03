"""Data for the frontend ``sitemap.xml`` (``GET /seo/sitemap/``)."""

import datetime as dt

from django.core.cache import cache
from django.db.models import Max, Q
from django.db.models.functions import Greatest

from apps.catalog.models import Book, Category, ExamType, Subject

SITEMAP_CACHE_KEY = "seo:sitemap"
SITEMAP_CACHE_SECONDS = 300


def iso_utc(value: dt.datetime) -> str:
    """``2026-10-02T12:00:00Z``."""
    return value.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _taxonomy(model) -> list[dict]:
    rows = model.objects.filter(is_active=True).order_by("slug").values_list("slug", "updated_at")
    return [{"slug": slug, "updated_at": iso_utc(updated)} for slug, updated in rows]


def build_sitemap_data() -> dict:
    """Active books that have at least one active variant, plus active taxonomies.

    A book's ``updated_at`` is the later of the book row and its active variants (price changes).
    ``cover`` is the storage URL (relative with local storage; the view makes it absolute).
    """
    active_variant = Q(variants__is_active=True)
    books = (
        Book.objects.filter(is_active=True)
        .annotate(variant_updated=Max("variants__updated_at", filter=active_variant))
        .filter(variant_updated__isnull=False)
        .annotate(last_modified=Greatest("updated_at", "variant_updated"))
        .order_by("slug")
    )
    return {
        "books": [
            {
                "slug": b.slug,
                "updated_at": iso_utc(b.last_modified),
                "cover": b.cover.url if b.cover else None,
            }
            for b in books
        ],
        "categories": _taxonomy(Category),
        "subjects": _taxonomy(Subject),
        "exam_types": _taxonomy(ExamType),
    }


def sitemap_data() -> dict:
    data = cache.get(SITEMAP_CACHE_KEY)
    if data is None:
        data = build_sitemap_data()
        cache.set(SITEMAP_CACHE_KEY, data, SITEMAP_CACHE_SECONDS)
    return data
