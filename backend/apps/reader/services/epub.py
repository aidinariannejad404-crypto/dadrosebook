"""EPUB unpacking for chapter-by-chapter streaming.

The uploaded EPUB stays in private storage and is never sent to a browser. ``process_epub`` reads it
once and stores, per spine item, sanitized HTML (no scripts, styles or publisher CSS; links and
image sources rewritten) plus its plain text for search and virtual pages. Images are copied to
private storage and served only through signed, user-bound URLs (``signing.asset_url``).

Hardening: zip limits (entry count, per-entry and total size, compression ratio), paths resolved
inside the archive only, XML with entity declarations rejected, HTML sanitized with ``nh3``.
"""

import hashlib
import math
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import unquote
from xml.etree import ElementTree as ET

import nh3
from django.core.files.base import ContentFile
from django.db import transaction

from apps.core.money import format_number
from apps.library.models import EbookFile

from ..models import EpubAsset, EpubChapter, EpubPackage
from .files import InvalidEbookFile
from .fold import utf16_len

CHARS_PER_PAGE = 1200
MAX_ENTRIES = 10_000
MAX_ENTRY_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 400 * 1024 * 1024
MAX_RATIO = 200
MAX_IMAGE_BYTES = 15 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}  # no SVG: it can carry scripts if opened directly
RTL_LANGS = ("fa", "ar", "he", "ur", "ps", "ckb")
ASSET_PLACEHOLDER = "/__asset__/"
ASSET_RE = re.compile(r'src="/__asset__/(\d+)"')

ALLOWED_TAGS = {
    *("h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span", "section", "article", "aside"),
    *("blockquote", "ol", "ul", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot"),
    *("tr", "th", "td", "caption", "em", "strong", "b", "i", "u", "sub", "sup", "small"),
    *("mark", "br", "hr", "figure", "figcaption", "img", "a", "abbr", "cite", "q", "code"),
    *("pre", "header", "footer", "nav"),
}
ALLOWED_ATTRIBUTES = {
    "*": {"id", "dir", "lang", "title"},
    "a": {"href"},
    "img": {"src", "alt"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "ol": {"start"},
}


class InvalidEpub(InvalidEbookFile):
    pass


@dataclass
class ManifestItem:
    id: str
    path: str
    media_type: str
    properties: str = ""


@dataclass
class EpubDocument:
    title: str
    language: str
    direction: str
    manifest: dict[str, ManifestItem]
    spine: list[ManifestItem]
    nav: ManifestItem | None = None
    ncx: ManifestItem | None = None
    by_path: dict[str, ManifestItem] = field(default_factory=dict)


@dataclass
class TocEntry:
    title: str
    path: str
    fragment: str
    level: int


# ---------- zip + xml ----------


def open_zip(fileobj) -> zipfile.ZipFile:
    try:
        zf = zipfile.ZipFile(fileobj)
    except (zipfile.BadZipFile, OSError, ValueError) as exc:
        raise InvalidEpub("فایل EPUB معتبر نیست (zip خراب است).") from exc
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise InvalidEpub("تعداد فایل‌های داخل EPUB بیش از حد مجاز است.")
    total = 0
    for info in infos:
        total += info.file_size
        if info.file_size > MAX_ENTRY_BYTES:
            raise InvalidEpub(f"فایل «{info.filename}» داخل EPUB بیش از حد بزرگ است.")
        if info.compress_size and info.file_size / info.compress_size > MAX_RATIO:
            raise InvalidEpub("نسبت فشرده‌سازی EPUB مشکوک است.")
    if total > MAX_TOTAL_BYTES:
        raise InvalidEpub("حجم بازشده‌ی EPUB بیش از حد مجاز است.")
    return zf


def read_member(zf: zipfile.ZipFile, path: str, limit: int = MAX_ENTRY_BYTES) -> bytes:
    try:
        with zf.open(path) as fh:
            data = fh.read(limit + 1)
    except KeyError as exc:
        raise InvalidEpub(f"فایل «{path}» در EPUB پیدا نشد.") from exc
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError) as exc:
        raise InvalidEpub(f"خواندن «{path}» از EPUB ممکن نشد.") from exc
    if len(data) > limit:
        raise InvalidEpub(f"فایل «{path}» داخل EPUB بیش از حد بزرگ است.")
    return data


def parse_xml(data: bytes) -> ET.Element:
    if b"<!ENTITY" in data:
        raise InvalidEpub("فایل XML با تعریف entity پذیرفته نمی‌شود.")
    try:
        return ET.fromstring(data)  # noqa: S314
    except ET.ParseError as exc:
        raise InvalidEpub("ساختار XML فایل EPUB خراب است.") from exc


def local(tag) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def children(el: ET.Element, name: str) -> list[ET.Element]:
    return [c for c in el if local(c.tag) == name]


def first(el: ET.Element, name: str) -> ET.Element | None:
    return next((c for c in el.iter() if local(c.tag) == name), None)


def resolve(base_path: str, href: str) -> str | None:
    """Resolve ``href`` against the document at ``base_path``; None if it leaves the archive."""
    href = unquote(href.strip())
    if not href or href.startswith("/") or "://" in href or href.startswith("data:"):
        return None
    path = posixpath.normpath(posixpath.join(posixpath.dirname(base_path), href))
    if path.startswith("../") or path == ".." or path.startswith("/"):
        return None
    return path


# ---------- package (OPF) ----------


def parse_document(zf: zipfile.ZipFile) -> EpubDocument:
    container = parse_xml(read_member(zf, "META-INF/container.xml", 1024 * 1024))
    rootfile = first(container, "rootfile")
    opf_path = rootfile.get("full-path", "") if rootfile is not None else ""
    if not opf_path:
        raise InvalidEpub("فایل container.xml مسیر OPF ندارد.")
    opf = parse_xml(read_member(zf, opf_path, 8 * 1024 * 1024))

    metadata = first(opf, "metadata")
    title = language = ""
    if metadata is not None:
        title_el = first(metadata, "title")
        lang_el = first(metadata, "language")
        title = (title_el.text or "").strip() if title_el is not None else ""
        language = (lang_el.text or "").strip().lower() if lang_el is not None else ""
    language = language or "fa"

    manifest: dict[str, ManifestItem] = {}
    manifest_el = first(opf, "manifest")
    for item in children(manifest_el, "item") if manifest_el is not None else []:
        path = resolve(opf_path, item.get("href", ""))
        if not path or not item.get("id"):
            continue
        manifest[item.get("id")] = ManifestItem(
            id=item.get("id"),
            path=path,
            media_type=(item.get("media-type") or "").lower(),
            properties=item.get("properties") or "",
        )

    spine_el = first(opf, "spine")
    if spine_el is None:
        raise InvalidEpub("EPUB فهرست خواندن (spine) ندارد.")
    spine = []
    for ref in children(spine_el, "itemref"):
        item = manifest.get(ref.get("idref", ""))
        if item and item.media_type in ("application/xhtml+xml", "text/html"):
            spine.append(item)
    if not spine:
        raise InvalidEpub("EPUB هیچ فصل قابل‌خواندنی ندارد.")

    ppd = (spine_el.get("page-progression-direction") or "").lower()
    if ppd in ("rtl", "ltr"):
        direction = ppd
    else:
        direction = "rtl" if language.split("-")[0] in RTL_LANGS else "ltr"

    nav = next((i for i in manifest.values() if "nav" in i.properties.split()), None)
    ncx = manifest.get(spine_el.get("toc", "")) or next(
        (i for i in manifest.values() if i.media_type == "application/x-dtbncx+xml"), None
    )
    return EpubDocument(
        title=title[:300],
        language=language[:20],
        direction=direction,
        manifest=manifest,
        spine=spine,
        nav=nav,
        ncx=ncx,
        by_path={i.path: i for i in manifest.values()},
    )


# ---------- table of contents ----------


class _NavParser(HTMLParser):
    """Collects ``<a>`` entries of the EPUB 3 ``<nav epub:type="toc">`` with their list depth."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries: list[tuple[str, str, int]] = []
        self.any_entries: list[tuple[str, str, int]] = []
        self.nav_depth = 0
        self.is_toc = False
        self.level = 0
        self.href: str | None = None
        self.text: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "nav":
            self.nav_depth += 1
            if self.nav_depth == 1:
                kind = (attrs.get("epub:type") or "") + " " + (attrs.get("role") or "")
                self.is_toc = "toc" in kind
        elif self.nav_depth and tag == "ol":
            self.level += 1
        elif self.nav_depth and tag == "a":
            self.href = attrs.get("href") or ""
            self.text = []

    def handle_endtag(self, tag):
        if tag == "nav" and self.nav_depth:
            self.nav_depth -= 1
            if not self.nav_depth:
                self.is_toc = False
                self.level = 0
        elif self.nav_depth and tag == "ol":
            self.level = max(0, self.level - 1)
        elif self.nav_depth and tag == "a" and self.href is not None:
            entry = (" ".join("".join(self.text).split()), self.href, max(0, self.level - 1))
            (self.entries if self.is_toc else self.any_entries).append(entry)
            self.href = None

    def handle_data(self, data):
        if self.href is not None:
            self.text.append(data)


def _toc_from_nav(zf, doc: EpubDocument) -> list[TocEntry]:
    raw = read_member(zf, doc.nav.path, 8 * 1024 * 1024).decode("utf-8", "replace")
    parser = _NavParser()
    parser.feed(raw)
    out = []
    for title, href, level in parser.entries or parser.any_entries:
        path, _, frag = href.partition("#")
        target = resolve(doc.nav.path, path) if path else doc.nav.path
        if title and target:
            out.append(TocEntry(title=title, path=target, fragment=frag, level=level))
    return out


def _toc_from_ncx(zf, doc: EpubDocument) -> list[TocEntry]:
    root = parse_xml(read_member(zf, doc.ncx.path, 8 * 1024 * 1024))
    nav_map = first(root, "navMap")
    out: list[TocEntry] = []

    def walk(el, level):
        for point in children(el, "navPoint"):
            label = first(point, "text")
            content = next((c for c in point if local(c.tag) == "content"), None)
            title = " ".join((label.text or "").split()) if label is not None else ""
            src = content.get("src", "") if content is not None else ""
            path, _, frag = src.partition("#")
            target = resolve(doc.ncx.path, path)
            if title and target:
                out.append(TocEntry(title=title, path=target, fragment=frag, level=level))
            walk(point, level + 1)

    if nav_map is not None:
        walk(nav_map, 0)
    return out


def parse_toc(zf, doc: EpubDocument) -> list[TocEntry]:
    try:
        if doc.nav:
            entries = _toc_from_nav(zf, doc)
            if entries:
                return entries
        if doc.ncx:
            return _toc_from_ncx(zf, doc)
    except InvalidEpub:
        return []  # a broken TOC is not fatal: chapters still have titles
    return []


# ---------- chapter html ----------

BODY_RE = re.compile(r"<body\b[^>]*>(.*)</body\s*>", re.IGNORECASE | re.DOTALL)
SVG_IMAGE_RE = re.compile(
    r"<svg\b[^>]*>.*?<image\b[^>]*?(?:xlink:)?href\s*=\s*[\"']([^\"']+)[\"'][^>]*>.*?</svg\s*>",
    re.IGNORECASE | re.DOTALL,
)
HEADING_RE = re.compile(r"<h[1-3]\b[^>]*>(.*?)</h[1-3]\s*>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")


def extract_body(raw: str) -> str:
    match = BODY_RE.search(raw)
    body = match.group(1) if match else raw
    # Covers are often an <svg><image xlink:href=…></svg>: keep them as plain images.
    return SVG_IMAGE_RE.sub(lambda m: f'<img src="{m.group(1)}" alt="">', body)


def sanitize_html(raw_body: str, *, rewrite_href, rewrite_src) -> str:
    def attribute_filter(tag, attr, value):
        if tag == "a" and attr == "href":
            return rewrite_href(value)
        if tag == "img" and attr == "src":
            return rewrite_src(value)
        return value

    html = nh3.clean(
        raw_body,
        tags=ALLOWED_TAGS,
        clean_content_tags={"script", "style", "title", "head", "noscript", "template"},
        attributes=ALLOWED_ATTRIBUTES,
        attribute_filter=attribute_filter,
        url_schemes={"http", "https"},
        link_rel="noopener noreferrer nofollow",
        set_tag_attribute_values={"a": {"target": "_blank"}},
        id_prefix="epub-",
        strip_comments=True,
    )
    return html.strip()


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data):
        self.parts.append(data)


def html_text(html: str) -> str:
    """Plain text of sanitized html, as the browser's ``textContent`` would give it."""
    parser = _TextParser()
    parser.feed(html)
    parser.close()
    return "".join(parser.parts)


def first_heading(html: str) -> str:
    match = HEADING_RE.search(html)
    if not match:
        return ""
    return " ".join(html_text(TAG_RE.sub(" ", match.group(1))).split())[:300]


def pages_for(chars: int) -> int:
    return max(1, math.ceil(chars / CHARS_PER_PAGE))


# ---------- processing ----------


def inspect_upload(django_file) -> EpubDocument:
    """Parse an uploaded EPUB enough to reject broken files in the admin form."""
    django_file.seek(0)
    try:
        zf = open_zip(django_file)
        doc = parse_document(zf)
    finally:
        django_file.seek(0)
    return doc


def delete_package(ebook: EbookFile) -> None:
    package = EpubPackage.objects.filter(ebook=ebook).first()
    if package is None:
        return
    for asset in package.assets.all():
        asset.file.delete(save=False)
    package.delete()


def process_epub(ebook: EbookFile) -> EpubPackage:
    """(Re)build the chapter package for ``ebook``. Raises ``InvalidEpub`` for broken files."""
    if ebook.format != EbookFile.Format.EPUB:
        raise InvalidEpub("این فایل EPUB نیست.")
    with ebook.file.open("rb") as fh:
        zf = open_zip(fh)
        doc = parse_document(zf)
        toc = parse_toc(zf, doc)
        delete_package(ebook)
        written: list[EpubAsset] = []
        try:
            with transaction.atomic():
                package = _build(ebook, zf, doc, toc, written)
        except Exception:
            for asset in written:
                asset.file.delete(save=False)
            raise
    return package


def _build(ebook, zf, doc: EpubDocument, toc: list[TocEntry], written: list) -> EpubPackage:
    package = EpubPackage.objects.create(
        ebook=ebook, title=doc.title, language=doc.language, direction=doc.direction
    )
    chapter_of = {item.path: index for index, item in enumerate(doc.spine)}
    assets: dict[str, EpubAsset | None] = {}

    def link_for(path: str, frag: str) -> str | None:
        index = chapter_of.get(path)
        return None if index is None else f"#epub:{index}:{frag}"

    def asset_for(path: str) -> str | None:
        if path not in assets:
            assets[path] = _store_asset(package, zf, doc, path, written)
        asset = assets[path]
        return f"{ASSET_PLACEHOLDER}{asset.pk}" if asset else None

    chapters = []
    page = 1
    for index, item in enumerate(doc.spine):

        def rewrite_href(value, base=item.path):
            value = value.strip()
            if value.lower().startswith(("http://", "https://")):
                return value
            if value.startswith("#"):
                return link_for(base, value[1:])
            path, _, frag = value.partition("#")
            target = resolve(base, path)
            return link_for(target, frag) if target else None

        def rewrite_src(value, base=item.path):
            target = resolve(base, value)
            return asset_for(target) if target else None

        raw = read_member(zf, item.path).decode("utf-8", "replace")
        html = sanitize_html(extract_body(raw), rewrite_href=rewrite_href, rewrite_src=rewrite_src)
        text = html_text(html)
        chars = utf16_len(" ".join(text.split()))
        pages = pages_for(chars)
        chapters.append(
            EpubChapter(
                package=package,
                index=index,
                href=item.path[:500],
                title=first_heading(html),
                html=html,
                text=text,
                chars=utf16_len(text),
                start_page=page,
                pages=pages,
            )
        )
        page += pages

    toc_out = []
    for entry in toc:
        index = chapter_of.get(entry.path)
        if index is None:
            continue
        toc_out.append(
            {
                "title": entry.title[:300],
                "chapter": index,
                "anchor": entry.fragment[:200],
                "level": min(entry.level, 5),
            }
        )
    titled = {}
    for item in toc_out:
        if item["chapter"] not in titled or not item["anchor"]:
            titled.setdefault(item["chapter"], item["title"])
    for chapter in chapters:
        chapter.title = (
            titled.get(chapter.index) or chapter.title or f"بخش {format_number(chapter.index + 1)}"
        )[:300]
    if not toc_out:
        toc_out = [
            {"title": c.title, "chapter": c.index, "anchor": "", "level": 0} for c in chapters
        ]

    EpubChapter.objects.bulk_create(chapters)
    package.toc = toc_out
    package.total_pages = page - 1
    package.total_chars = sum(c.chars for c in chapters)
    package.save()
    return package


def _store_asset(package, zf, doc: EpubDocument, path: str, written: list) -> EpubAsset | None:
    item = doc.by_path.get(path)
    if item is None or item.media_type not in IMAGE_TYPES:
        return None
    try:
        data = read_member(zf, path, MAX_IMAGE_BYTES)
    except InvalidEpub:
        return None
    name = hashlib.sha256(path.encode()).hexdigest()[:20] + IMAGE_TYPES[item.media_type]
    asset = EpubAsset(package=package, path=path[:500], media_type=item.media_type)
    asset.file.save(name, ContentFile(data), save=True)
    written.append(asset)
    return asset


def get_package(ebook: EbookFile) -> EpubPackage:
    """The processed package; processed on first use if the admin save did not do it."""
    package = EpubPackage.objects.filter(ebook=ebook).first()
    return package or process_epub(ebook)
