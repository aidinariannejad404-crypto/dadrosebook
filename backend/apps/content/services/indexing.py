"""Indexability guardrail for hub pages (package ب۷).

Google's "scaled content abuse" policy (March 2024) targets templated pages with no unique value.
A hub is only indexable — robots ``index`` and listed in the sitemap — when it has real content:

* exam / subject hubs and curated lists: an editorial intro of at least
  ``HUB_INDEX_MIN_INTRO_WORDS`` words (not a placeholder) **and** at least ``HUB_INDEX_MIN_BOOKS``
  active books;
* authors / translators: at least one book, and a bio (``AUTHOR_INDEX_MIN_BIO_WORDS`` words) or
  at least ``AUTHOR_INDEX_MIN_BOOKS`` books;
* publishers: at least ``PUBLISHER_INDEX_MIN_BOOKS`` books.

Everything else renders normally for visitors but carries ``noindex, follow``.
"""

import html
import re

import nh3
from django.conf import settings

EXAM = "exam"
SUBJECT = "subject"
AUTHOR = "author"
PUBLISHER = "publisher"
LIST = "list"
KINDS = (EXAM, SUBJECT, AUTHOR, PUBLISHER, LIST)

# A bio this short is a name tag, not a biography.
AUTHOR_INDEX_MIN_BIO_WORDS = 25

_SPACE_RE = re.compile(r"\s+")


def plain_text(value: str | None) -> str:
    """Visible text of (sanitised) HTML: tags dropped, entities decoded, whitespace collapsed."""
    if not value:
        return ""
    # Block-level tags become spaces so "<p>a</p><p>b</p>" is two words.
    spaced = re.sub(r"<(/?(p|br|li|h[1-6]|div|tr|td|th|blockquote)\b[^>]*)>", r" <\1> ", value)
    text = html.unescape(nh3.clean(spaced, tags=set()))
    return _SPACE_RE.sub(" ", text).strip()


def word_count(value: str | None) -> int:
    """Words in the visible text. ZWNJ (نیم‌فاصله) is not whitespace, so «می‌شود» is one word."""
    text = plain_text(value)
    return len(text.split(" ")) if text else 0


def min_intro_words() -> int:
    return settings.HUB_INDEX_MIN_INTRO_WORDS


def is_indexable(
    kind: str,
    *,
    book_count: int,
    intro_words: int = 0,
    intro_is_placeholder: bool = False,
    bio_words: int = 0,
) -> bool:
    """The guardrail rule above. ``kind`` is one of ``KINDS``."""
    return not missing_requirements(
        kind,
        book_count=book_count,
        intro_words=intro_words,
        intro_is_placeholder=intro_is_placeholder,
        bio_words=bio_words,
    )


def missing_requirements(
    kind: str,
    *,
    book_count: int,
    intro_words: int = 0,
    intro_is_placeholder: bool = False,
    bio_words: int = 0,
) -> list[str]:
    """Why a hub is not indexable, in Persian for the admin (empty when it is indexable)."""
    from apps.core.money import to_persian_digits as fa

    missing: list[str] = []
    if kind in (EXAM, SUBJECT, LIST):
        need_words = settings.HUB_INDEX_MIN_INTRO_WORDS
        need_books = settings.HUB_INDEX_MIN_BOOKS
        if intro_is_placeholder:
            missing.append("مقدمه هنوز متن موقت است")
        if intro_words < need_words:
            missing.append(f"مقدمه {fa(intro_words)} کلمه است (حداقل {fa(need_words)})")
        if book_count < need_books:
            missing.append(f"{fa(book_count)} کتاب فعال دارد (حداقل {fa(need_books)})")
    elif kind == AUTHOR:
        if book_count < 1:
            missing.append("هیچ کتاب فعالی ندارد")
        elif (
            bio_words < AUTHOR_INDEX_MIN_BIO_WORDS and book_count < settings.AUTHOR_INDEX_MIN_BOOKS
        ):
            missing.append(
                f"زندگی‌نامه (حداقل {fa(AUTHOR_INDEX_MIN_BIO_WORDS)} کلمه) یا حداقل "
                f"{fa(settings.AUTHOR_INDEX_MIN_BOOKS)} کتاب لازم است"
            )
    elif kind == PUBLISHER:
        if book_count < settings.PUBLISHER_INDEX_MIN_BOOKS:
            missing.append(
                f"{fa(book_count)} کتاب فعال دارد (حداقل {fa(settings.PUBLISHER_INDEX_MIN_BOOKS)})"
            )
    else:
        raise ValueError(f"unknown hub kind: {kind}")
    return missing


def hub_status(obj) -> tuple[bool, list[str]]:
    """``(indexable, missing)`` for an ExamType, Subject, Person or Publisher row (admin)."""
    from django.db.models import Q

    from apps.catalog.models import ExamType, Person, Publisher, Subject

    from .hubs import active_books

    if isinstance(obj, ExamType | Subject):
        kind = EXAM if isinstance(obj, ExamType) else SUBJECT
        lookup = {"exam_types": obj} if kind == EXAM else {"subjects": obj}
        kwargs = {
            "book_count": active_books().filter(**lookup).distinct().count(),
            "intro_words": word_count(obj.intro),
            "intro_is_placeholder": obj.intro_is_placeholder,
        }
    elif isinstance(obj, Person):
        kind = AUTHOR
        books = active_books().filter(Q(authors=obj) | Q(translators=obj)).distinct()
        kwargs = {"book_count": books.count(), "bio_words": word_count(obj.bio)}
    elif isinstance(obj, Publisher):
        kind = PUBLISHER
        kwargs = {"book_count": active_books().filter(publisher=obj).count()}
    else:
        raise TypeError(type(obj))
    missing = missing_requirements(kind, **kwargs)
    return (not missing, missing)
