"""Shareable kit links (research item و۳).

* ``create_share(exam_slug, variant_ids)`` → ``KitShare`` (the same kit always gets the same token).
* ``resolve(token=..., slugs=..., exam_slug=...)`` → ``SharedKit`` with the books (card querysets)
  and the chosen variant per book, or ``None``.

Two link shapes reach ``/kit``: ``?k=<token>`` (exact formats) and ``?exam=…&b=slug1,slug2`` (the
default format of each book). Both pages are ``noindex`` with the canonical ``/kit``.
"""

import hashlib
import secrets
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction
from django.db.models import F

from ..models import KitShare

MAX_BOOKS = 40
TOKEN_BYTES = 6  # 8 url-safe characters


class KitShareError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class SharedKit:
    exam: object = None  # catalog.ExamType | None
    books: list = field(default_factory=list)  # Book (card queryset rows), in the shared order
    selected: dict = field(default_factory=dict)  # book id → variant id
    token: str | None = None


def _fingerprint(exam_id, variant_ids) -> str:
    raw = f"{exam_id or 0}:{','.join(str(v) for v in variant_ids)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def create_share(exam_slug: str | None, variant_ids) -> KitShare:
    from apps.catalog.models import BookVariant, ExamType

    exam = ExamType.objects.filter(slug=exam_slug, is_active=True).first() if exam_slug else None
    wanted = []
    for value in variant_ids or []:
        try:
            vid = int(value)
        except (TypeError, ValueError):
            continue
        if vid not in wanted:
            wanted.append(vid)
    wanted = wanted[:MAX_BOOKS]
    known = set(
        BookVariant.objects.filter(pk__in=wanted, is_active=True, book__is_active=True).values_list(
            "id", flat=True
        )
    )
    ids = [v for v in wanted if v in known]
    if not ids:
        raise KitShareError("کیت خالی است؛ دست‌کم یک کتاب انتخاب کنید.")
    fingerprint = _fingerprint(exam.pk if exam else None, ids)
    existing = KitShare.objects.filter(fingerprint=fingerprint).first()
    if existing:
        return existing
    for _ in range(5):
        try:
            with transaction.atomic():
                return KitShare.objects.create(
                    token=secrets.token_urlsafe(TOKEN_BYTES),
                    fingerprint=fingerprint,
                    exam_type=exam,
                    variant_ids=ids,
                )
        except IntegrityError:
            existing = KitShare.objects.filter(fingerprint=fingerprint).first()
            if existing:
                return existing
    raise KitShareError("ساخت لینک انجام نشد؛ دوباره تلاش کنید.")


def _cards(book_ids):
    from apps.catalog.services.books import book_card_queryset

    by_id = {b.pk: b for b in book_card_queryset().filter(pk__in=book_ids)}
    return [by_id[i] for i in book_ids if i in by_id]


def resolve(*, token: str | None = None, slugs=None, exam_slug: str | None = None):
    from apps.catalog.models import Book, BookVariant, ExamType

    if token:
        share = KitShare.objects.select_related("exam_type").filter(token=token).first()
        if share is None:
            return None
        KitShare.objects.filter(pk=share.pk).update(views=F("views") + 1)
        variants = BookVariant.objects.filter(pk__in=share.variant_ids).values_list("id", "book_id")
        book_of = dict(variants)
        book_ids, selected = [], {}
        for vid in share.variant_ids:
            book_id = book_of.get(vid)
            if book_id is not None and book_id not in selected:
                selected[book_id] = vid
                book_ids.append(book_id)
        return SharedKit(
            exam=share.exam_type, books=_cards(book_ids), selected=selected, token=share.token
        )

    slugs = [s.strip() for s in (slugs or []) if s and s.strip()][:MAX_BOOKS]
    if not slugs:
        return None
    exam = ExamType.objects.filter(slug=exam_slug, is_active=True).first() if exam_slug else None
    ids_by_slug = dict(
        Book.objects.filter(slug__in=slugs, is_active=True).values_list("slug", "id")
    )
    book_ids = list(dict.fromkeys(ids_by_slug[s] for s in slugs if s in ids_by_slug))
    if not book_ids:
        return None
    return SharedKit(exam=exam, books=_cards(book_ids), selected={})
