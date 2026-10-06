"""Screenshot deterrence settings for the reader: the protection level and the per-user trace code.

A web page cannot block OS screenshots; the reader blanks itself on every signal it gets
(focus loss, screenshot shortcuts, multi-finger gestures) and draws ``trace_code`` faintly over
each page so a leaked screenshot can be traced back to the account
(admin: «کدهای ردیابی اسکرین‌شات»).
"""

import re
import secrets

from django.db import IntegrityError, transaction

from apps.catalog.models import Book
from apps.core.normalize import normalize_persian
from apps.library.models import EbookFile

from ..models import ReaderTraceCode

# Crockford-style alphabet without 0/O, 1/I/L, U: easy to read off a blurry screenshot.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_RE = re.compile(r"[^0-9A-Z]")


def _new_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_code(text: str) -> str:
    """``" k7q2 m9xd "`` / ``"k7q2m9xd"`` → ``"K7Q2-M9XD"`` (Persian digits accepted)."""
    raw = CODE_RE.sub("", normalize_persian(text or "").upper())
    return f"{raw[:4]}-{raw[4:8]}" if len(raw) == 8 else raw


def trace_code(user, book: Book) -> str:
    existing = ReaderTraceCode.objects.filter(user=user, book=book).only("code").first()
    if existing:
        return existing.code
    for _ in range(10):
        try:
            with transaction.atomic():
                return ReaderTraceCode.objects.create(user=user, book=book, code=_new_code()).code
        except IntegrityError:
            existing = ReaderTraceCode.objects.filter(user=user, book=book).first()
            if existing:  # a parallel request created it
                return existing.code
    raise RuntimeError("could not allocate a trace code")


def protection_info(user, book: Book, ebook: EbookFile) -> dict:
    return {"level": ebook.protection, "trace_code": trace_code(user, book)}


def find(code: str) -> ReaderTraceCode | None:
    return (
        ReaderTraceCode.objects.select_related("user", "book")
        .filter(code=normalize_code(code))
        .first()
    )
