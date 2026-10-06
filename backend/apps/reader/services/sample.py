"""د۵: the free sample in the real reader, without login.

What a sample is (per ``EbookFile``): ``sample_pages`` pages, or by default
``READER_SAMPLE_PERCENT`` (10) percent of the book capped at ``READER_SAMPLE_MAX_PAGES`` (30); an
admin value is capped at ``READER_SAMPLE_MAX_SHARE`` (50) percent. EPUB pages are the reader's
virtual pages (``CHARS_PER_PAGE`` characters): whole chapters from the start while they fit, then
the next chapter cut at the budget. PDF: a separate file holding only those pages
(``pdf.build_sample``, cached as ``PdfSample``).

The server never sends anything past the sample: chapter requests beyond it are 404, the cut
chapter is truncated here, images are signed only when the sample shows them, and the PDF sample
is a different file.
"""

import math
from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.urls import reverse

from apps.catalog.models import Book, BookVariant
from apps.library.models import EbookFile

from ..models import EpubAsset, EpubPackage, PdfSample
from .access import ReaderError
from .epub import ASSET_RE, CHARS_PER_PAGE, get_package, html_text, pages_for
from .fold import utf16_len
from .pdf import PdfError, build_sample
from .pdftext import read_file, text_index
from .signing import _is_presigning_storage, ttl_seconds

WATERMARK = "نمونه رایگان"
VOID = {"br", "hr", "img", "wbr"}
SAMPLE_ASSET_SALT = "apps.reader.sample-asset"


class NoSample(ReaderError):
    status = 404
    code = "no_sample"
    message = "نمونه این کتاب در کتاب‌خوان در دسترس نیست."


# ---------- size ----------


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def sample_page_count(ebook: EbookFile, total_pages: int) -> int:
    total = max(1, int(total_pages or 1))
    share_cap = max(1, math.floor(total * _setting("READER_SAMPLE_MAX_SHARE", 50) / 100))
    if ebook.sample_pages:
        wanted = min(ebook.sample_pages, share_cap)
    else:
        wanted = min(
            math.ceil(total * _setting("READER_SAMPLE_PERCENT", 10) / 100),
            _setting("READER_SAMPLE_MAX_PAGES", 30),
        )
    return max(1, min(wanted, total, share_cap if total > 1 else 1))


# ---------- which file ----------


def sample_ebook(book: Book) -> EbookFile | None:
    if not book.is_active:
        return None
    ebook = EbookFile.objects.filter(book=book, is_active=True).order_by("-version").first()
    if ebook is None or not ebook.file or not ebook.sample_enabled:
        return None
    return ebook


def sample_available(book: Book) -> bool:
    """For the product page button: the active file allows a sample (cheap: no file is read)."""
    return sample_ebook(book) is not None


def require_sample(book: Book) -> EbookFile:
    ebook = sample_ebook(book)
    if ebook is None:
        raise NoSample
    return ebook


# ---------- EPUB ----------


@dataclass
class SampleChapter:
    index: int
    title: str
    limit: int | None  # UTF-16 characters kept; None = whole chapter
    chars: int
    start_page: int = 1
    pages: int = 1


def epub_plan(ebook: EbookFile, package: EpubPackage) -> list[SampleChapter]:
    pages = sample_page_count(ebook, package.total_pages)
    budget = pages * CHARS_PER_PAGE
    used = 0
    plan: list[SampleChapter] = []
    for c in package.chapters.only("index", "title", "chars").order_by("index"):
        if used + c.chars <= budget:
            plan.append(SampleChapter(c.index, c.title, None, c.chars))
            used += c.chars
            continue
        remaining = budget - used
        if remaining >= 200 or not plan:
            plan.append(SampleChapter(c.index, c.title, max(1, remaining), max(1, remaining)))
        break
    page = 1
    for item in plan:
        item.start_page = page
        item.pages = pages_for(item.chars)
        page += item.pages
    return plan


class _Truncator(HTMLParser):
    def __init__(self, limit: int):
        super().__init__(convert_charrefs=True)
        self.limit = limit
        self.used = 0
        self.out: list[str] = []
        self.stack: list[str] = []
        self.done = False

    @staticmethod
    def _tag(tag, attrs, close=False) -> str:
        parts = "".join(
            f' {name}="{escape(value or "", quote=True)}"' for name, value in attrs if name
        )
        return f"<{tag}{parts}{' /' if close else ''}>"

    def handle_starttag(self, tag, attrs):
        if self.done:
            return
        self.out.append(self._tag(tag, attrs))
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if not self.done:
            self.out.append(self._tag(tag, attrs))

    def handle_endtag(self, tag):
        if self.done or tag not in self.stack:
            return
        while self.stack:
            top = self.stack.pop()
            self.out.append(f"</{top}>")
            if top == tag:
                break

    def handle_data(self, data):
        if self.done:
            return
        n = utf16_len(data)
        if self.used + n <= self.limit:
            self.out.append(escape(data, quote=False))
            self.used += n
            return
        keep = data[: max(0, self.limit - self.used)]
        cut = keep.rfind(" ")
        if cut > len(keep) - 40 and cut > 0:
            keep = keep[:cut]
        self.out.append(escape(keep.rstrip(), quote=False) + "…")
        self.done = True

    def result(self) -> str:
        return "".join(self.out) + "".join(f"</{t}>" for t in reversed(self.stack))


def truncate_html(html: str, limit: int) -> str:
    """Sanitized chapter html cut after ``limit`` UTF-16 characters of text (tags closed)."""
    parser = _Truncator(limit)
    parser.feed(html)
    parser.close()
    return parser.result()


def _sample_asset_url(asset: EpubAsset) -> str:
    storage = asset.file.storage
    if _is_presigning_storage(storage):
        return storage.url(
            asset.file.name,
            parameters={
                "ResponseCacheControl": "private, no-store",
                "ResponseContentType": asset.media_type,
            },
            expire=ttl_seconds(),
        )
    token = signing.dumps({"a": asset.pk}, salt=SAMPLE_ASSET_SALT, compress=True)
    return reverse("reader:sample-asset", kwargs={"token": token})


def _chapter_html(package: EpubPackage, item: SampleChapter) -> str:
    chapter = package.chapters.get(index=item.index)
    return chapter.html if item.limit is None else truncate_html(chapter.html, item.limit)


def epub_info(ebook: EbookFile, package: EpubPackage, plan: list[SampleChapter]) -> dict:
    indexes = {c.index for c in plan}
    return {
        "language": package.language,
        "direction": package.direction,
        "total_pages": sum(c.pages for c in plan),
        "chapters": [
            {
                "index": c.index,
                "title": c.title,
                "start_page": c.start_page,
                "pages": c.pages,
                "chars": c.chars,
            }
            for c in plan
        ],
        "toc": [t for t in package.toc if t.get("chapter") in indexes],
    }


def sample_chapter(book: Book, index: int) -> dict:
    ebook = require_sample(book)
    if ebook.format != EbookFile.Format.EPUB:
        raise NoSample
    package = get_package(ebook)
    plan = epub_plan(ebook, package)
    item = next((c for c in plan if c.index == index), None)
    if item is None:
        raise NoSample
    html = _chapter_html(package, item)
    assets = {a.pk: a for a in package.assets.all()} if "/__asset__/" in html else {}

    def sign(match):
        asset = assets.get(int(match.group(1)))
        return f'src="{escape(_sample_asset_url(asset))}"' if asset else 'src=""'

    position = plan.index(item)
    last = position == len(plan) - 1
    return {
        "index": item.index,
        "title": item.title,
        "start_page": item.start_page,
        "pages": item.pages,
        "chars": utf16_len(html_text(html)),
        "prev": plan[position - 1].index if position > 0 else None,
        "next": None if last else plan[position + 1].index,
        "html": ASSET_RE.sub(sign, html),
        "sample_end": last,
    }


def redeem_sample_asset(token: str) -> EpubAsset:
    try:
        data = signing.loads(token, salt=SAMPLE_ASSET_SALT, max_age=ttl_seconds())
    except signing.BadSignature as exc:
        raise NoSample from exc
    asset = (
        EpubAsset.objects.select_related("package__ebook__book").filter(pk=data.get("a")).first()
    )
    if asset is None:
        raise NoSample
    ebook = asset.package.ebook
    if sample_ebook(ebook.book) != ebook:
        raise NoSample
    marker = f'src="/__asset__/{asset.pk}"'
    for item in epub_plan(ebook, asset.package):
        if marker in _chapter_html(asset.package, item):
            return asset
    raise NoSample  # the image is in the part of the book the sample does not show


# ---------- PDF ----------


def drop_pdf_sample(ebook: EbookFile) -> None:
    sample = PdfSample.objects.filter(ebook=ebook).first()
    if sample is not None:
        sample.file.delete(save=False)
        sample.delete()


def pdf_sample(ebook: EbookFile) -> PdfSample:
    """The cached sample file for ``ebook`` (built on first use; rebuilt if the size changed)."""
    index = text_index(ebook)
    total = index.page_count if index is not None and index.ok else 0
    sample = PdfSample.objects.filter(ebook=ebook).first()
    try:
        data = None
        if not total:
            data = read_file(ebook)
            from .pdf import page_count

            total = page_count(data)
        wanted = sample_page_count(ebook, total)
        if sample is not None and sample.pages == wanted and sample.file:
            return sample
        data = data or read_file(ebook)
        out, pages = build_sample(data, wanted)
    except (PdfError, OSError, RecursionError) as exc:
        raise NoSample from exc
    if sample is not None:
        sample.file.delete(save=False)
    else:
        sample = PdfSample(ebook=ebook)
    sample.pages, sample.total_pages = pages, total
    sample.file.save("sample.pdf", ContentFile(out), save=True)
    return sample


# ---------- session ----------


def offers(book: Book) -> list[dict]:
    """The ebook and bundle variants for the end-of-sample call to action."""
    out = []
    for v in BookVariant.objects.filter(
        book=book, is_active=True, type__in=[BookVariant.Type.EBOOK, BookVariant.Type.BUNDLE]
    ).order_by("type"):
        out.append(
            {
                "id": v.id,
                "type": v.type,
                "label": v.get_type_display(),
                "price": v.effective_price,
                "in_stock": v.in_stock,
            }
        )
    return out


def sample_session(request, book: Book) -> dict:
    from .access import can_read

    ebook = require_sample(book)
    data = {
        "book": book,
        "format": ebook.format,
        "version": ebook.version,
        "watermark": WATERMARK,
        "offers": offers(book),
        "owned": bool(request.user.is_authenticated and can_read(request.user, book)),
        "epub": None,
        "file_url": "",
    }
    if ebook.format == EbookFile.Format.EPUB:
        package = get_package(ebook)
        plan = epub_plan(ebook, package)
        info = epub_info(ebook, package, plan)
        data["epub"] = info
        data["sample_pages"] = info["total_pages"]
        data["total_pages"] = package.total_pages
    else:
        sample = pdf_sample(ebook)
        data["sample_pages"] = sample.pages
        data["total_pages"] = sample.total_pages
        data["file_url"] = reverse("reader:sample-file", kwargs={"slug": book.slug})
    return data
