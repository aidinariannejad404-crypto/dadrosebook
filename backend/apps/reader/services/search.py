"""In-book search over the processed EPUB chapters (folded, see ``fold``)."""

import re

from ..models import EpubPackage
from .fold import fold

MIN_QUERY = 2
MAX_QUERY = 100
MAX_RESULTS = 100
CONTEXT = 40
SPACE_RE = re.compile(r"\s+")


class BadQuery(ValueError):
    pass


def clean_query(q: str | None) -> str:
    q = " ".join((q or "").split())
    if len(q) < MIN_QUERY:
        raise BadQuery("عبارت جستجو باید دست‌کم دو نویسه باشد.")
    if len(q) > MAX_QUERY:
        raise BadQuery("عبارت جستجو بیش از حد طولانی است.")
    return q


def search(package: EpubPackage, q: str) -> dict:
    needle = fold(clean_query(q))
    results = []
    truncated = False
    for chapter in package.chapters.only("index", "title", "text").order_by("index"):
        text = chapter.text
        hay = fold(text)
        start = 0
        occurrence = 0
        while (pos := hay.find(needle, start)) != -1:
            if len(results) >= MAX_RESULTS:
                truncated = True
                break
            end = pos + len(needle)
            before = SPACE_RE.sub(" ", text[max(0, pos - CONTEXT) : pos]).lstrip()
            after = SPACE_RE.sub(" ", text[end : end + CONTEXT]).rstrip()
            results.append(
                {
                    "chapter": chapter.index,
                    "title": chapter.title,
                    "occurrence": occurrence,
                    "before": ("…" if pos > CONTEXT else "") + before,
                    "match": text[pos:end],
                    "after": after + ("…" if end + CONTEXT < len(text) else ""),
                }
            )
            occurrence += 1
            start = end
        if truncated:
            break
    return {"results": results, "truncated": truncated}
