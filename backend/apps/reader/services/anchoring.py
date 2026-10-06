"""Finding a piece of text again in a (new) version of a book.

Text is compared *compact and folded*: Persian/Arabic letter variants and digits folded (``fold``),
ZWNJ and every whitespace removed. That survives re-flowed paragraphs, a different PDF text
extractor (pdf.js in the browser vs ours) and typographic clean-ups between versions. Each compact
character keeps its UTF-16 offset in the original text (the reader's EPUB offsets are UTF-16, see
``fold.utf16_len``).

A match is scored by how much of the stored context before/after it agrees; ties go to the
segment (chapter/page) the annotation was in and to the nearest relative position.
"""

from dataclasses import dataclass

from .fold import fold

CONTEXT_CHARS = 48
MIN_UNAMBIGUOUS = 4  # shorter quotes need context agreement unless they occur once
MAX_OCCURRENCES = 500


def _is_gap(ch: str) -> bool:
    return ch.isspace() or ch in "‌‍‎‏ـ"  # ZWNJ/ZWJ, marks, tatweel


def compact(text: str) -> str:
    return "".join(c for c in fold(text or "") if not _is_gap(c))


@dataclass
class Segment:
    """One chapter (EPUB) or page (PDF) of a file."""

    key: int
    text: str
    compact: str = ""
    offsets: list[int] | None = None  # compact index → UTF-16 offset of that char in ``text``
    widths: list[int] | None = None  # compact index → UTF-16 width of that char (1 or 2)
    end16: int = 0

    def __post_init__(self):
        out, offsets, widths = [], [], []
        pos16 = 0
        for ch in self.text:
            f = fold(ch)
            w = 2 if ord(ch) > 0xFFFF else 1
            if not _is_gap(f):
                out.append(f)
                offsets.append(pos16)
                widths.append(w)
            pos16 += w
        self.compact = "".join(out)
        self.offsets = offsets
        self.widths = widths
        self.end16 = pos16

    def span16(self, start: int, end: int) -> tuple[int, int]:
        """UTF-16 ``(start, end)`` covering compact chars ``[start, end)``."""
        return self.offsets[start], self.offsets[end - 1] + self.widths[end - 1]

    def offset16(self, compact_index: int) -> int:
        if compact_index >= len(self.offsets):
            return self.end16
        return self.offsets[compact_index]

    def compact_index(self, offset16: int) -> int:
        """First compact char at or after a UTF-16 offset."""
        lo, hi = 0, len(self.offsets)
        while lo < hi:
            mid = (lo + hi) // 2
            if self.offsets[mid] < offset16:
                lo = mid + 1
            else:
                hi = mid
        return lo


@dataclass
class Match:
    key: int
    start16: int
    end16: int
    score: int


def py_index(text: str, offset16: int) -> int:
    """Python string index for a UTF-16 offset."""
    if offset16 <= 0:
        return 0
    pos16 = 0
    for i, ch in enumerate(text):
        if pos16 >= offset16:
            return i
        pos16 += 2 if ord(ch) > 0xFFFF else 1
    return len(text)


def _squash(text: str) -> str:
    return " ".join(text.split())


def context_at(text: str, start16: int, end16: int, size: int = CONTEXT_CHARS) -> tuple[str, str]:
    """``(before, after)``: up to ``size`` chars around ``[start16, end16)`` (squashed)."""
    a, b = py_index(text, start16), py_index(text, end16)
    before = _squash(text[max(0, a - size * 2) : a])[-size:]
    after = _squash(text[b : b + size * 2])[:size]
    return before, after


def _common_suffix(a: str, b: str) -> int:
    n = 0
    for x, y in zip(reversed(a), reversed(b), strict=False):
        if x != y:
            break
        n += 1
    return n


def _common_prefix(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b, strict=False):
        if x != y:
            break
        n += 1
    return n


def find_in(segment: Segment, quote: str, *, near16: int | None = None) -> tuple[int, int] | None:
    """UTF-16 ``(start, end)`` of ``quote`` in one segment (closest to ``near16``)."""
    needle = compact(quote)
    if not needle:
        return None
    hits = []
    pos = segment.compact.find(needle)
    while pos != -1 and len(hits) < MAX_OCCURRENCES:
        hits.append(pos)
        pos = segment.compact.find(needle, pos + 1)
    if not hits:
        return None
    if near16 is not None:
        hits.sort(key=lambda p: abs(segment.offset16(p) - near16))
    return segment.span16(hits[0], hits[0] + len(needle))


def locate(
    segments: list[Segment],
    quote: str,
    *,
    before: str = "",
    after: str = "",
    hint_key: int | None = None,
    hint_ratio: float | None = None,
    point: bool = False,
) -> Match | None:
    """Best place for ``quote`` (with its context) across ``segments``; ``None`` if not found.

    ``point=True`` locates a position rather than a span: ``quote`` is the text right after the
    position (may be empty at the end of a chapter, then ``before`` is used).
    """
    needle = compact(quote)
    cb, ca = compact(before), compact(after)
    if not needle and point and cb:
        found = locate(segments, before, hint_key=hint_key, hint_ratio=hint_ratio)
        if found is None:
            return None
        return Match(found.key, found.end16, found.end16, found.score)
    if not needle:
        return None
    candidates = []
    total = 0
    for seg in segments:
        pos = seg.compact.find(needle)
        while pos != -1 and total < MAX_OCCURRENCES:
            total += 1
            score = 0
            if cb:
                score += _common_suffix(seg.compact[max(0, pos - len(cb)) : pos], cb)
            if ca:
                end = pos + len(needle)
                score += _common_prefix(seg.compact[end : end + len(ca)], ca)
            same = 1 if hint_key is not None and seg.key == hint_key else 0
            dist = 0.0
            if hint_ratio is not None and seg.compact:
                dist = abs(pos / len(seg.compact) - hint_ratio)
            candidates.append((score, same, -dist, -abs(seg.key - (hint_key or 0)), seg, pos))
            pos = seg.compact.find(needle, pos + 1)
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[:4], reverse=True)
    best = candidates[0]
    if len(candidates) > 1 and len(needle) < MIN_UNAMBIGUOUS and best[0] == 0:
        return None  # a two-letter highlight with no agreeing context could be anywhere
    score, _, _, _, seg, pos = best
    start16, end16 = seg.span16(pos, pos + len(needle))
    if point:
        return Match(seg.key, start16, start16, score)
    return Match(seg.key, start16, end16, score)
