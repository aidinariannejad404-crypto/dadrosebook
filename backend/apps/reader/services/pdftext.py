"""Per-page text of PDF ebook files (``PdfTextIndex``), built once per file on upload."""

import logging

from apps.library.models import EbookFile

from ..models import PdfTextIndex
from .pdf import PdfError, page_texts

logger = logging.getLogger(__name__)

MAX_PDF_BYTES = 300 * 1024 * 1024


def read_file(ebook: EbookFile) -> bytes:
    with ebook.file.open("rb") as fh:
        data = fh.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise PdfError("file too large")
    return data


def build_text_index(ebook: EbookFile) -> PdfTextIndex:
    """(Re)extract the page texts of a PDF file; failures are recorded, never raised."""
    try:
        pages = page_texts(read_file(ebook))
        values = {"pages": pages, "page_count": len(pages), "ok": True, "error": ""}
    except (PdfError, OSError, RecursionError) as exc:
        logger.warning("PDF text extraction failed for %s: %s", ebook, exc)
        values = {"pages": [], "page_count": 0, "ok": False, "error": str(exc)[:200]}
    index, _ = PdfTextIndex.objects.update_or_create(ebook=ebook, defaults=values)
    return index


def text_index(ebook: EbookFile, *, build: bool = True) -> PdfTextIndex | None:
    index = PdfTextIndex.objects.filter(ebook=ebook).first()
    if index is None and build and ebook.format == EbookFile.Format.PDF and ebook.file:
        index = build_text_index(ebook)
    return index


def page_text(ebook: EbookFile, page: int) -> str | None:
    """Text of one page (1-based) or None when unknown."""
    index = text_index(ebook)
    if index is None or not index.ok or not (1 <= page <= len(index.pages)):
        return None
    return index.pages[page - 1]
