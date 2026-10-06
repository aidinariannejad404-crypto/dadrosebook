"""The user's notebook for one book (highlights, notes, bookmarks) as Markdown or printable HTML.

Quotes are book text, so they are capped: each at ``QUOTE_MAX`` characters and all of them
together at the book's copy quota. Notes are the user's own words and are never cut.
"""

import re
from dataclasses import dataclass, field
from html import escape
from urllib.parse import quote

from django.utils import timezone

from apps.catalog.models import Book
from apps.core.jalali import to_jalali_str
from apps.core.money import format_number
from apps.library.models import EbookFile

from ..models import Bookmark, EpubPackage, Highlight
from .quota import quota_limit

QUOTE_MAX = 300
LOCATION_RE = re.compile(r"^epub:(\d+):")
COLOR_LABELS = dict(Highlight.Color.choices)


@dataclass
class Entry:
    page: int
    kind: str  # "highlight" | "bookmark"
    quote: str = ""
    note: str = ""
    color: str = ""
    label: str = ""


@dataclass
class Group:
    title: str
    entries: list[Entry] = field(default_factory=list)


def _chapter_titles(book: Book) -> dict[int, str] | None:
    ebook = EbookFile.objects.filter(book=book, is_active=True).order_by("-version").first()
    if ebook is None or ebook.format != EbookFile.Format.EPUB:
        return None
    package = EpubPackage.objects.filter(ebook=ebook).first()
    if package is None:
        return None
    return dict(package.chapters.values_list("index", "title"))


def _group_key(location: str, page: int, chapters: dict[int, str] | None):
    match = LOCATION_RE.match(location or "")
    if chapters is not None and match:
        index = int(match.group(1))
        return (0, index), chapters.get(index, f"بخش {format_number(index + 1)}")
    return (1, page), f"صفحه {format_number(page)}"


def build_notebook(user, book: Book) -> list[Group]:
    chapters = _chapter_titles(book)
    budget = quota_limit(book)
    groups: dict[tuple, Group] = {}
    items: list[tuple[tuple, str, Entry]] = []
    for h in Highlight.objects.filter(user=user, book=book).order_by("page", "created_at", "id"):
        key, title = _group_key(h.location, h.page, chapters)
        text = " ".join(h.text.split())
        if len(text) > QUOTE_MAX:
            text = text[:QUOTE_MAX].rstrip() + "…"
        entry = Entry(page=h.page, kind="highlight", quote=text, note=h.note.strip(), color=h.color)
        items.append((key, title, entry))
    for b in Bookmark.objects.filter(user=user, book=book).order_by("page", "created_at"):
        key, title = _group_key(b.location, b.page, chapters)
        items.append((key, title, Entry(page=b.page, kind="bookmark", label=b.label.strip())))
    items.sort(key=lambda it: (it[0], it[2].page, it[2].kind != "bookmark"))
    for key, title, entry in items:
        if entry.quote:
            if budget <= 0:
                entry.quote = "[متن به‌دلیل سقف سهمیه کپی حذف شد]"
            else:
                if len(entry.quote) > budget:
                    entry.quote = entry.quote[:budget].rstrip() + "…"
                budget -= len(entry.quote)
        groups.setdefault(key, Group(title=title)).entries.append(entry)
    return list(groups.values())


def _header(book: Book) -> tuple[str, str, str]:
    authors = "، ".join(p.name for p in book.authors.all())
    date = to_jalali_str(timezone.localdate(), persian_digits=True)
    return book.title, authors, date


def render_markdown(user, book: Book) -> str:
    title, authors, date = _header(book)
    lines = [f"# یادداشت‌های «{title}»", ""]
    if authors:
        lines.append(f"نویسنده: {authors}  ")
    lines += [f"تاریخ دریافت: {date} · کتابفروشی دادرُز", ""]
    groups = build_notebook(user, book)
    if not groups:
        lines.append("هنوز هایلایت، یادداشت یا نشانکی ثبت نکرده‌اید.")
    for group in groups:
        lines += [f"## {group.title}", ""]
        for e in group.entries:
            page = f"صفحه {format_number(e.page)}"
            if e.kind == "bookmark":
                lines.append(f"- 🔖 نشانک · {page}" + (f" — {e.label}" if e.label else ""))
                lines.append("")
                continue
            lines.append(f"> {e.quote}")
            lines.append(f"> — هایلایت {COLOR_LABELS.get(e.color, '')} · {page}")
            if e.note:
                lines += ["", f"**یادداشت:** {e.note}"]
            lines.append("")
    lines.append(f"— «{title}»" + (f"، {authors}" if authors else "") + "، کتابفروشی دادرُز")
    return "\n".join(lines) + "\n"


HTML_STYLE = """
body{font-family:Vazirmatn,Tahoma,sans-serif;max-width:46em;margin:2rem auto;padding:0 1rem;
color:#10182b;line-height:1.9;background:#fff}
h1{font-size:1.5rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:2rem 0 .75rem;
border-bottom:2px solid #c8a24b;padding-bottom:.25rem}.meta{color:#4a5568;font-size:.9rem}
blockquote{margin:.75rem 0;padding:.5rem .9rem;border-inline-start:4px solid var(--c,#f7d64a);
background:#f7f7f2;border-radius:6px}.src{font-size:.85rem;color:#4a5568}
.note{margin:.25rem 0 1rem;padding-inline-start:.9rem}.bm{color:#12264a;font-size:.95rem}
@media print{body{margin:0}h2{break-after:avoid}blockquote{break-inside:avoid}}
"""
SWATCH = {"yellow": "#e3b505", "green": "#3aa856", "blue": "#3b82c4", "pink": "#d6609a"}


def render_html(user, book: Book) -> str:
    title, authors, date = _header(book)
    e_ = escape
    parts = [
        '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="robots" content="noindex">',
        f"<title>یادداشت‌های {e_(title)}</title><style>{HTML_STYLE}</style></head><body>",
        f"<h1>یادداشت‌های «{e_(title)}»</h1>",
        f'<p class="meta">{e_(authors) + " · " if authors else ""}تاریخ دریافت: {e_(date)}'
        " · کتابفروشی دادرُز</p>",
    ]
    groups = build_notebook(user, book)
    if not groups:
        parts.append("<p>هنوز هایلایت، یادداشت یا نشانکی ثبت نکرده‌اید.</p>")
    for group in groups:
        parts.append(f"<h2>{e_(group.title)}</h2>")
        for en in group.entries:
            page = f"صفحه {format_number(en.page)}"
            if en.kind == "bookmark":
                label = f" — {e_(en.label)}" if en.label else ""
                parts.append(f'<p class="bm">🔖 نشانک · {page}{label}</p>')
                continue
            color = SWATCH.get(en.color, "#e3b505")
            parts.append(
                f'<blockquote style="--c:{color}">{e_(en.quote)}'
                f'<div class="src">هایلایت {e_(COLOR_LABELS.get(en.color, ""))} · {page}</div>'
                "</blockquote>"
            )
            if en.note:
                parts.append(f'<p class="note"><strong>یادداشت:</strong> {e_(en.note)}</p>')
    parts.append("</body></html>")
    return "\n".join(parts)


def content_disposition(book: Book, ext: str) -> str:
    name = f"دفترچه-یادداشت-{book.slug}.{ext}"
    return f"attachment; filename=\"notes.{ext}\"; filename*=UTF-8''{quote(name)}"
