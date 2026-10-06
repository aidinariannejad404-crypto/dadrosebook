"""Reader background jobs (Celery)."""

import logging

from celery import shared_task
from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)

DEDUPE_SECONDS = 30


@shared_task(ignore_result=True)
def reanchor_book_annotations(ebook_id: int, force: bool = False) -> dict:
    """ه۱: move a book's highlights/bookmarks/positions onto the file ``ebook_id``."""
    from apps.library.models import EbookFile

    from .services.reanchor import reanchor_book

    ebook = EbookFile.objects.select_related("book").filter(pk=ebook_id, is_active=True).first()
    if ebook is None:
        return {}
    cache.delete(_key(ebook_id))
    return reanchor_book(ebook.book, ebook, force=force)


def _key(ebook_id: int) -> str:
    return f"reader:reanchor:{ebook_id}"


def queue_reanchor(ebook, *, force: bool = False) -> None:
    """Queue re-anchoring once the current transaction commits (deduplicated for a few seconds)."""
    from .services.reanchor import needs_reanchor

    if not force and not needs_reanchor(ebook.book, ebook.version):
        return
    if not force and not cache.add(_key(ebook.pk), 1, DEDUPE_SECONDS):
        return

    def send():
        try:
            reanchor_book_annotations.delay(ebook.pk, force)
        except Exception:  # broker down: the next activation or `process_ebooks --reanchor` retries
            logger.exception("could not queue re-anchoring for %s", ebook)
            cache.delete(_key(ebook.pk))

    transaction.on_commit(send)
