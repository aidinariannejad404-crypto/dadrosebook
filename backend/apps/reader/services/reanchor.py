"""ه۱: highlights, bookmarks and reading positions survive a new ebook file version.

* **At creation** (``stamp_*``) an annotation records the file version it points into and a short
  text context (EPUB: from the chapter text; PDF: from the page text index).
* **When a new version is activated** (``files.activate`` → Celery ``reanchor_book_annotations``)
  ``reanchor_book`` finds each annotation's text again in the new file (``anchoring.locate``) and
  moves it there. What cannot be found is kept, marked ``ORPHANED``, and listed in the reader's
  «یادداشت‌های جابه‌جا شده» — never deleted. Reading positions fall back to the same percentage.

Annotations made before this feature have no version/context: the previous file (the newest
version older than the new one) supplies their context.
"""

import logging
import math
import re
from dataclasses import dataclass, field

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Book
from apps.library.models import EbookFile

from ..models import AnchorStatus, Bookmark, EpubChapter, EpubPackage, Highlight, ReadingProgress
from .anchoring import CONTEXT_CHARS, Segment, context_at, locate
from .epub import InvalidEpub, get_package
from .pdftext import page_text, text_index

logger = logging.getLogger(__name__)

EPUB_RANGE_RE = re.compile(r"^epub:(\d+):(\d+)-(\d+)$")
EPUB_POINT_RE = re.compile(r"^epub:(\d+):(\d+)$")


# ---------- a file's text ----------


@dataclass
class ChapterMeta:
    start_page: int
    pages: int
    chars: int


@dataclass
class Corpus:
    ebook: EbookFile
    segments: list[Segment]
    chapters: dict[int, ChapterMeta] = field(default_factory=dict)  # EPUB only
    total_pages: int = 0

    @property
    def is_epub(self) -> bool:
        return self.ebook.format == EbookFile.Format.EPUB

    def segment(self, key: int) -> Segment | None:
        return next((s for s in self.segments if s.key == key), None)

    def virtual_page(self, chapter: int, offset16: int) -> int:
        """Mirror of the reader's ``virtualPage`` (``frontend/src/lib/reader-epub.ts``)."""
        meta = self.chapters.get(chapter)
        if meta is None:
            return 1
        pages, start = max(1, meta.pages), max(1, meta.start_page)
        if meta.chars <= 0 or offset16 <= 0:
            return start
        within = math.floor(min(offset16, meta.chars) / meta.chars * pages)
        return start + min(pages - 1, max(0, within))

    def chapter_for_page(self, page: int) -> int:
        found = min(self.chapters) if self.chapters else 0
        for index, meta in sorted(self.chapters.items()):
            if meta.start_page <= page:
                found = index
        return found


def load_corpus(ebook: EbookFile) -> Corpus | None:
    """The file's text by chapter (EPUB) or page (PDF); None when it cannot be read."""
    if ebook is None or not ebook.file:
        return None
    if ebook.format == EbookFile.Format.EPUB:
        try:
            package = get_package(ebook)
        except (InvalidEpub, OSError):
            return None
        chapters = list(package.chapters.order_by("index"))
        return Corpus(
            ebook=ebook,
            segments=[Segment(c.index, c.text) for c in chapters],
            chapters={c.index: ChapterMeta(c.start_page, c.pages, c.chars) for c in chapters},
            total_pages=package.total_pages,
        )
    index = text_index(ebook)
    if index is None or not index.ok or not index.pages:
        return None
    return Corpus(
        ebook=ebook,
        segments=[Segment(i + 1, t) for i, t in enumerate(index.pages)],
        total_pages=index.page_count,
    )


def active_ebook(book: Book) -> EbookFile | None:
    return EbookFile.objects.filter(book=book, is_active=True).order_by("-version").first()


def _chapter_text(ebook: EbookFile, index: int) -> str | None:
    package = EpubPackage.objects.filter(ebook=ebook).first()
    if package is None:
        return None
    chapter = EpubChapter.objects.filter(package=package, index=index).only("text").first()
    return chapter.text if chapter else None


# ---------- context at creation ----------


def _clip(value: str) -> str:
    return " ".join((value or "").split())[:CONTEXT_CHARS]


def stamp_highlight(book: Book, data: dict, *, version: int | None = None) -> dict:
    """Add ``ebook_version`` and context to new-highlight data (client context is a fallback)."""
    ebook = _file_for(book, version)
    out = dict(data)
    out["context_before"] = _clip(out.get("context_before", ""))
    out["context_after"] = _clip(out.get("context_after", ""))
    if ebook is None:
        return out
    out["ebook_version"] = ebook.version
    loc = EPUB_RANGE_RE.match(out.get("location") or "")
    if ebook.format == EbookFile.Format.EPUB and loc:
        text = _chapter_text(ebook, int(loc.group(1)))
        if text is not None:
            before, after = context_at(text, int(loc.group(2)), int(loc.group(3)))
            out["context_before"], out["context_after"] = before, after
    elif ebook.format == EbookFile.Format.PDF:
        text = page_text(ebook, int(out.get("page") or 1))
        if text:
            seg = Segment(int(out.get("page") or 1), text)
            found = locate([seg], out.get("text", ""), before=out["context_before"])
            if found:
                out["context_before"], out["context_after"] = context_at(
                    text, found.start16, found.end16
                )
    return out


def stamp_point(book: Book, *, page: int, location: str, version: int | None = None) -> dict:
    """Version and context for a bookmark or reading position."""
    ebook = _file_for(book, version)
    if ebook is None:
        return {}
    out = {"ebook_version": ebook.version}
    loc = EPUB_POINT_RE.match(location or "")
    if ebook.format == EbookFile.Format.EPUB and loc:
        text = _chapter_text(ebook, int(loc.group(1)))
        if text is not None:
            before, after = context_at(text, int(loc.group(2)), int(loc.group(2)))
            out["context_before"], out["context_after"] = before, after
    return out


def stamp_pdf_bookmark(book: Book, *, page: int, version: int | None = None) -> dict:
    ebook = _file_for(book, version)
    if ebook is None or ebook.format != EbookFile.Format.PDF:
        return {}
    text = page_text(ebook, page)
    return {"context_after": _clip(text)} if text else {}


def _file_for(book: Book, version: int | None) -> EbookFile | None:
    if version:
        found = EbookFile.objects.filter(book=book, version=version).order_by("-is_active").first()
        if found:
            return found
    return active_ebook(book)


# ---------- re-anchoring ----------


@dataclass
class Result:
    moved: int = 0
    kept: int = 0
    orphaned: int = 0
    skipped: int = 0

    def as_dict(self) -> dict:
        return {
            "moved": self.moved,
            "kept": self.kept,
            "orphaned": self.orphaned,
            "skipped": self.skipped,
        }


class _Corpora:
    """Old-version corpora, loaded once per run."""

    def __init__(self, book: Book, target: EbookFile):
        self.book = book
        self.target = target
        self.cache: dict[int | None, Corpus | None] = {}

    def for_version(self, version: int | None) -> Corpus | None:
        if version not in self.cache:
            qs = EbookFile.objects.filter(book=self.book).exclude(pk=self.target.pk)
            if version is None:
                # legacy annotation: the file that was active before the new one
                ebook = qs.filter(version__lt=self.target.version).order_by("-version").first()
            else:
                ebook = qs.filter(version=version).order_by("-id").first()
            self.cache[version] = load_corpus(ebook) if ebook else None
        return self.cache[version]


def _old_position(obj, *, span: bool) -> tuple[int | None, int | None, int | None, float | None]:
    """``(segment key, start16, end16, ratio hint)`` of an annotation in its own version."""
    location = getattr(obj, "location", "") or ""
    m = (EPUB_RANGE_RE if span else EPUB_POINT_RE).match(location)
    if m:
        start = int(m.group(2))
        end = int(m.group(3)) if span else start
        return int(m.group(1)), start, end, None
    return obj.page, None, None, None


def _fill_context(obj, old: Corpus | None, *, span: bool) -> None:
    """Legacy annotations: take their context from the version they were made in."""
    if old is None or (obj.context_before or obj.context_after):
        return
    key, start, end, _ = _old_position(obj, span=span)
    seg = old.segment(key) if key is not None else None
    if seg is None:
        return
    if start is not None:
        obj.context_before, obj.context_after = context_at(seg.text, start, end)
    elif span:
        found = locate([seg], obj.text)
        if found:
            obj.context_before, obj.context_after = context_at(seg.text, found.start16, found.end16)
    else:
        obj.context_after = _clip(seg.text)


def _hint_ratio(obj, old: Corpus | None, *, span: bool) -> float | None:
    key, start, _end, _ = _old_position(obj, span=span)
    if old is None or start is None:
        return None
    seg = old.segment(key)
    if seg is None or seg.end16 <= 0:
        return None
    return min(1.0, start / seg.end16)


def _place(new: Corpus, key: int, start16: int, end16: int, *, span: bool) -> dict:
    if new.is_epub:
        location = f"epub:{key}:{start16}-{end16}" if span else f"epub:{key}:{start16}"
        return {"page": new.virtual_page(key, start16), "location": location}
    return {"page": key, "location": ""}


def _apply(obj, new: Corpus, found, *, span: bool, now, keep_rects: bool = False) -> None:
    seg = new.segment(found.key)
    old_page = obj.page
    placed = _place(new, found.key, found.start16, found.end16, span=span)
    obj.page = placed["page"]
    obj.location = placed["location"]
    if seg is not None:
        before, after = context_at(seg.text, found.start16, found.end16)
        obj.context_before, obj.context_after = before, after
    if span and not keep_rects:
        obj.rects = []  # PDF: the reader re-derives the boxes from the page's text layer
    obj.anchor_status = AnchorStatus.ANCHORED
    obj.ebook_version = new.ebook.version
    obj.previous_page = old_page if old_page != obj.page else obj.previous_page
    obj.reanchored_at = now


def _orphan(obj, new: Corpus, *, now) -> None:
    if obj.anchor_status != AnchorStatus.ORPHANED:
        obj.previous_page = obj.page
    obj.anchor_status = AnchorStatus.ORPHANED
    obj.ebook_version = new.ebook.version
    obj.reanchored_at = now


ANCHOR_FIELDS = [
    "page",
    "location",
    "context_before",
    "context_after",
    "anchor_status",
    "ebook_version",
    "previous_page",
    "reanchored_at",
]


def reanchor_book(book: Book, target: EbookFile | None = None, *, force: bool = False) -> dict:
    """Move every annotation of ``book`` onto ``target`` (default: the active file)."""
    target = target or active_ebook(book)
    if target is None:
        return {}
    new = load_corpus(target)
    if new is None:
        logger.warning("re-anchoring skipped for %s: no text", target)
        return {"error": "no_text"}
    old = _Corpora(book, target)
    now = timezone.now()
    out = {}

    def todo(qs):
        return qs if force else qs.exclude(ebook_version=target.version)

    hl = Result()
    for h in todo(Highlight.objects.filter(book=book)).order_by("id").iterator():
        before = (h.page, h.location)
        old_corpus = old.for_version(h.ebook_version)
        _fill_context(h, old_corpus, span=True)
        key, *_ = _old_position(h, span=True)
        found = locate(
            new.segments,
            h.text,
            before=h.context_before,
            after=h.context_after,
            hint_key=key,
            hint_ratio=_hint_ratio(h, old_corpus, span=True),
        )
        if found is None:
            _orphan(h, new, now=now)
            hl.orphaned += 1
        else:
            _apply(
                h,
                new,
                found,
                span=True,
                now=now,
                keep_rects=_same_pdf_page(h, old_corpus, new, found),
            )
            if (h.page, h.location) == before:
                hl.kept += 1
            else:
                hl.moved += 1
        h.save(update_fields=[*ANCHOR_FIELDS, "rects", "updated_at"])
    out["highlights"] = hl.as_dict()

    bm = Result()
    for b in todo(Bookmark.objects.filter(book=book)).order_by("id").iterator():
        before = (b.page, b.location)
        old_corpus = old.for_version(b.ebook_version)
        _fill_context(b, old_corpus, span=False)
        key, *_ = _old_position(b, span=False)
        found = None
        if b.context_after or b.context_before:
            found = locate(
                new.segments,
                b.context_after,
                before=b.context_before,
                hint_key=key,
                hint_ratio=_hint_ratio(b, old_corpus, span=False),
                point=True,
            )
        if found is None:
            _orphan(b, new, now=now)
            bm.orphaned += 1
        else:
            _apply(b, new, found, span=False, now=now)
            duplicate = (
                Bookmark.objects.filter(
                    user_id=b.user_id, book=book, page=b.page, location=b.location
                )
                .exclude(pk=b.pk)
                .exists()
            )
            if duplicate:
                b.delete()
                bm.moved += 1
                continue
            if (b.page, b.location) == before:
                bm.kept += 1
            else:
                bm.moved += 1
        with transaction.atomic():
            b.save(update_fields=ANCHOR_FIELDS)
    out["bookmarks"] = bm.as_dict()

    pr = Result()
    for p in todo(ReadingProgress.objects.filter(book=book)).order_by("id").iterator():
        old_corpus = old.for_version(p.ebook_version)
        _fill_progress_context(p, old_corpus)
        key, *_ = _old_position(p, span=False)
        found = None
        if p.context_after:
            found = locate(
                new.segments,
                p.context_after,
                hint_key=key,
                hint_ratio=_hint_ratio(p, old_corpus, span=False),
                point=True,
            )
        if found is not None:
            placed = _place(new, found.key, found.start16, found.end16, span=False)
            p.page, p.location = placed["page"], placed["location"]
            pr.moved += 1
        else:
            # same share of the book
            ratio = p.page / p.total_pages if p.total_pages else 0
            p.page = max(1, min(new.total_pages or 1, round(ratio * (new.total_pages or 1)) or 1))
            p.location = ""
            pr.orphaned += 1
        p.total_pages = new.total_pages or p.total_pages
        p.ebook_version = target.version
        seg = new.segment(found.key) if found else None
        p.context_after = context_at(seg.text, found.start16, found.start16)[1] if seg else ""
        p.save(update_fields=["page", "total_pages", "location", "ebook_version", "context_after"])
    out["progress"] = pr.as_dict()
    logger.info("re-anchored %s on v%s: %s", book, target.version, out)
    return out


def _same_pdf_page(h: Highlight, old: Corpus | None, new: Corpus, found) -> bool:
    """PDF highlight staying on an unchanged page: its stored boxes are still right."""
    if new.is_epub or old is None or old.is_epub or found.key != h.page:
        return False
    a, b = old.segment(h.page), new.segment(found.key)
    return a is not None and b is not None and a.compact == b.compact


def _fill_progress_context(p: ReadingProgress, old: Corpus | None) -> None:
    if p.context_after or old is None:
        return
    m = EPUB_POINT_RE.match(p.location or "")
    if m:
        seg = old.segment(int(m.group(1)))
        if seg is not None:
            p.context_after = context_at(seg.text, int(m.group(2)), int(m.group(2)))[1]
    elif not old.is_epub:
        seg = old.segment(p.page)
        if seg is not None:
            p.context_after = _clip(seg.text)


def needs_reanchor(book: Book, version: int) -> bool:
    """Any annotation of the book not yet on ``version``?"""
    return any(
        model.objects.filter(book=book).exclude(ebook_version=version).exists()
        for model in (Highlight, Bookmark, ReadingProgress)
    )
