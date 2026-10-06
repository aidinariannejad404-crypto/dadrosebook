"""Torob product web service (API v3) and the Emalls feed (research item و۱).

Torob crawls ``POST /torob_api/v3/products`` on the storefront host (a Next.js rewrite to
``/api/v1/growth/torob/v3/products/``). One row per purchasable ``BookVariant``: ``page_unique`` is
the variant id and ``page_url`` the book's product page (all formats share one page).

Field names, the price unit and the token claims come from third-party integrations, not from
Torob's own documentation (blocked from our build environment): **confirm them in the Torob seller
panel** before going live (docs/growth-summary.md).

* ``products_page(page)`` / ``products_for(page_urls, page_uniques)`` → the response dict.
* ``verify_token(token)`` → ``None`` or raises ``TorobAuthError``.
* ``emalls_items()`` → rows for the Emalls JSON/XML feed.
"""

import base64
import binascii
import json
import math
import time
from urllib.parse import unquote, urlsplit

from django.conf import settings
from django.db.models import Prefetch

from apps.catalog.models import Book, BookVariant, Category, Person

from . import ed25519

API_VERSION = "torob_api_v3"
PAGE_SIZE = 100
MAX_LOOKUPS = 200
INSTOCK = "instock"
OUTOFSTOCK = "outofstock"

# DER prefix of an Ed25519 SubjectPublicKeyInfo (RFC 8410).
_SPKI_PREFIX = bytes.fromhex("302a300506032b6570032100")


class TorobAuthError(Exception):
    pass


# --- money ------------------------------------------------------------------------------------


def price_unit() -> str:
    unit = (getattr(settings, "TOROB_PRICE_UNIT", "toman") or "toman").lower()
    return "rial" if unit == "rial" else "toman"


def feed_price(toman: int | None) -> int | None:
    """Prices are integer toman in the DB; Torob may want rial (``TOROB_PRICE_UNIT=rial``)."""
    if toman is None:
        return None
    return toman * 10 if price_unit() == "rial" else toman


# --- JWT (X-Torob-Token) ----------------------------------------------------------------------


def _b64url(data: str) -> bytes:
    data = data.strip()
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def parse_public_key(value: str) -> bytes:
    """Accept a PEM ``PUBLIC KEY``, base64 of the DER/raw key, or 64 hex chars (raw 32 bytes)."""
    text = (value or "").strip()
    if not text:
        raise ValueError("empty key")
    if "BEGIN" in text:
        body = "".join(line for line in text.splitlines() if line and "-----" not in line)
        raw = base64.b64decode(body)
    elif len(text) == 64 and all(c in "0123456789abcdefABCDEF" for c in text):
        raw = bytes.fromhex(text)
    else:
        try:
            raw = base64.b64decode(text + "=" * (-len(text) % 4))
        except (binascii.Error, ValueError):
            raw = _b64url(text)
    if len(raw) == 44 and raw.startswith(_SPKI_PREFIX):
        raw = raw[len(_SPKI_PREFIX) :]
    if len(raw) != 32:
        raise ValueError("not an Ed25519 public key")
    return raw


def auth_mode() -> str:
    """``verify`` (key set), ``open`` (no key, DEBUG) or ``closed`` (no key in production)."""
    if (getattr(settings, "TOROB_PUBLIC_KEY", "") or "").strip():
        return "verify"
    return "open" if settings.DEBUG else "closed"


def verify_token(token: str | None, *, now: float | None = None) -> dict:
    """Verify an EdDSA JWT against ``TOROB_PUBLIC_KEY``; returns the claims.

    Checks the signature, ``exp`` (required), ``nbf``/``iat`` (with ``TOROB_JWT_LEEWAY`` seconds)
    and ``aud`` when ``TOROB_JWT_AUDIENCE`` is set.
    """
    if not token:
        raise TorobAuthError("missing token")
    try:
        key = parse_public_key(settings.TOROB_PUBLIC_KEY)
    except ValueError as exc:
        raise TorobAuthError("server key misconfigured") from exc
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise TorobAuthError("malformed token")
    try:
        header = json.loads(_b64url(parts[0]))
        claims = json.loads(_b64url(parts[1]))
        signature = _b64url(parts[2])
    except (binascii.Error, ValueError) as exc:
        raise TorobAuthError("malformed token") from exc
    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise TorobAuthError("malformed token")
    if header.get("alg") not in ("EdDSA", "Ed25519"):
        raise TorobAuthError("unsupported alg")
    if not ed25519.verify(key, f"{parts[0]}.{parts[1]}".encode(), signature):
        raise TorobAuthError("bad signature")

    now = time.time() if now is None else now
    leeway = getattr(settings, "TOROB_JWT_LEEWAY", 60)
    exp = claims.get("exp")
    if not isinstance(exp, int | float) or now > exp + leeway:
        raise TorobAuthError("token expired")
    nbf = claims.get("nbf")
    if isinstance(nbf, int | float) and now + leeway < nbf:
        raise TorobAuthError("token not yet valid")
    audience = (getattr(settings, "TOROB_JWT_AUDIENCE", "") or "").strip()
    if audience:
        aud = claims.get("aud")
        auds = aud if isinstance(aud, list) else [aud]
        if audience not in auds:
            raise TorobAuthError("wrong audience")
    return claims


# --- rows -------------------------------------------------------------------------------------


def site_url() -> str:
    return settings.SITE_URL.rstrip("/")


def product_url(book: Book) -> str:
    from urllib.parse import quote

    return f"{site_url()}/product/{quote(book.slug, safe='')}"


def availability(variant: BookVariant) -> str:
    """``instock`` only when the variant can be bought right now."""
    sellable = (
        variant.is_active
        and variant.book.is_active
        and not variant.price_is_placeholder
        and variant.in_stock
    )
    return INSTOCK if sellable else OUTOFSTOCK


def _variants_qs():
    return (
        BookVariant.objects.select_related("book", "book__publisher")
        .prefetch_related(
            Prefetch("book__authors", queryset=Person.objects.order_by("name", "id")),
            Prefetch("book__categories", queryset=Category.objects.order_by("order", "id")),
        )
        .order_by("id")
    )


def listed_variants():
    """Variants Torob should list: active, real price, on an active book."""
    return _variants_qs().filter(is_active=True, book__is_active=True, price_is_placeholder=False)


def _cover(book: Book, build_url) -> list[str]:
    if not book.cover:
        return []
    url = book.cover.url
    if url.startswith("http"):
        return [url]
    return [build_url(url) if build_url else f"{site_url()}{url}"]


def _spec(book: Book, variant: BookVariant) -> dict:
    spec = {
        "نوع نسخه": variant.get_type_display(),
        "نویسنده": "، ".join(a.name for a in book.authors.all()),
        "ناشر": book.publisher.name if book.publisher_id else "",
        "ویرایش": book.edition,
        "سال انتشار": str(book.publish_year) if book.publish_year else "",
        "تعداد صفحات": str(book.pages) if book.pages else "",
        "تعداد جلد": str(book.volumes) if book.volumes and book.volumes > 1 else "",
        "شابک": book.isbn,
    }
    return {k: v for k, v in spec.items() if v}


def product_row(variant: BookVariant, build_url=None) -> dict:
    book = variant.book
    discounted = variant.sale_price is not None and variant.sale_price < variant.price
    categories = list(book.categories.all())
    title = f"{book.title} ({variant.get_type_display()})"
    return {
        "page_unique": str(variant.pk),
        "page_url": product_url(book),
        "title": title,
        "subtitle": book.subtitle or "، ".join(a.name for a in book.authors.all()),
        "current_price": feed_price(variant.effective_price),
        "old_price": feed_price(variant.price) if discounted else None,
        "availability": availability(variant),
        "image_links": _cover(book, build_url),
        "category_name": categories[0].name if categories else "کتاب",
        "spec": _spec(book, variant),
        "guarantee": getattr(settings, "TOROB_GUARANTEE", ""),
    }


def _response(page: int, max_pages: int, rows: list[dict]) -> dict:
    return {
        "api_version": API_VERSION,
        "current_page": page,
        "max_pages": max_pages,
        "products": rows,
    }


def products_page(page: int = 1, build_url=None) -> dict:
    qs = listed_variants()
    total = qs.count()
    max_pages = max(1, math.ceil(total / PAGE_SIZE))
    page = max(1, page)
    start = (page - 1) * PAGE_SIZE
    rows = (
        [product_row(v, build_url) for v in qs[start : start + PAGE_SIZE]] if start < total else []
    )
    return _response(page, max_pages, rows)


def slug_from_url(url: str) -> str | None:
    """``https://…/product/<slug>`` (any host, encoded or not, trailing slash or query) → slug."""
    try:
        path = urlsplit(str(url).strip()).path
    except ValueError:
        return None
    parts = [p for p in unquote(path).split("/") if p]
    if len(parts) == 2 and parts[0] == "product":
        return parts[1]
    return None


def products_for(page_urls=(), page_uniques=(), build_url=None) -> dict:
    """Explicit lookups: every variant of the listed pages plus the listed variant ids.

    Inactive or placeholder-priced variants that were asked for come back as ``outofstock`` so
    Torob can update stale offers; unknown ids are left out.
    """
    slugs = {s for s in (slug_from_url(u) for u in list(page_urls)[:MAX_LOOKUPS]) if s}
    ids = set()
    for value in list(page_uniques)[:MAX_LOOKUPS]:
        try:
            ids.add(int(str(value).strip()))
        except (TypeError, ValueError):
            continue
    variants = []
    if slugs:
        variants += list(
            _variants_qs().filter(book__slug__in=slugs, is_active=True, price_is_placeholder=False)
        )
    if ids:
        variants += list(_variants_qs().filter(pk__in=ids))
    seen, rows = set(), []
    for v in sorted(variants, key=lambda v: v.pk):
        if v.pk in seen:
            continue
        seen.add(v.pk)
        rows.append(product_row(v, build_url))
    return _response(1, 1, rows)


# --- Emalls ----------------------------------------------------------------------------------


def emalls_items(build_url=None) -> list[dict]:
    """Emalls feed rows (same data as Torob; field names to confirm with Emalls support)."""
    items = []
    for v in listed_variants():
        row = product_row(v, build_url)
        items.append(
            {
                "id": row["page_unique"],
                "title": row["title"],
                "url": row["page_url"],
                "price": row["current_price"],
                "old_price": row["old_price"],
                "is_available": row["availability"] == INSTOCK,
                "image": row["image_links"][0] if row["image_links"] else "",
                "category": row["category_name"],
                "guarantee": row["guarantee"],
            }
        )
    return items


def emalls_xml(items: list[dict]) -> str:
    from xml.sax.saxutils import escape

    out = ['<?xml version="1.0" encoding="UTF-8"?>', "<products>"]
    for item in items:
        out.append("  <product>")
        for key in (
            "id",
            "title",
            "url",
            "price",
            "old_price",
            "is_available",
            "image",
            "category",
        ):
            value = item.get(key)
            if value is None or value == "":
                continue
            if isinstance(value, bool):
                value = "true" if value else "false"
            out.append(f"    <{key}>{escape(str(value))}</{key}>")
        out.append("  </product>")
    out.append("</products>")
    return "\n".join(out) + "\n"
