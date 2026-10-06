"""Persian text normalisation — the single normaliser used for search, slugs and phone numbers."""

import re
from typing import Literal

ZwnjMode = Literal["space", "remove", "keep"]

ZWNJ = "‌"
# Invisible marks treated like ZWNJ: RLM, LRM, zero width space.
_INVISIBLES = ("‏", "‎", "​")

_CHAR_MAP = str.maketrans(
    {
        "ي": "ی",  # Arabic yeh
        "ى": "ی",  # Arabic alef maksura
        "ك": "ک",  # Arabic kaf
        "ۀ": "ه",  # heh with yeh above
        "ة": "ه",  # teh marbuta
        "أ": "ا",
        "إ": "ا",
        "ؤ": "و",
        "ـ": None,  # tatweel
        "ٰ": None,  # superscript alef
        **{chr(cp): None for cp in range(0x064B, 0x0660)},  # Arabic diacritics (harakat)
        **{chr(0x06F0 + i): str(i) for i in range(10)},  # Persian digits
        **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic-Indic digits
    }
)

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_persian(text: str | None, *, zwnj: ZwnjMode = "space") -> str:
    """Normalise Persian/Arabic text.

    ي/ى→ی، ك→ک، ۀ/ة→ه، أ/إ→ا (آ is kept)، ؤ→و; Arabic diacritics and tatweel stripped;
    Persian/Arabic digits → ASCII; Latin lowercased; whitespace collapsed and stripped.
    ``zwnj`` decides what happens to ZWNJ (and RLM/LRM/ZWSP): ``"space"`` (default) turns it
    into a space, ``"remove"`` deletes it, ``"keep"`` keeps ZWNJ (other invisibles are removed).
    """
    if not text:
        return ""
    text = str(text).translate(_CHAR_MAP)
    if zwnj == "space":
        for ch in (ZWNJ, *_INVISIBLES):
            text = text.replace(ch, " ")
    elif zwnj == "remove":
        for ch in (ZWNJ, *_INVISIBLES):
            text = text.replace(ch, "")
    elif zwnj == "keep":
        for ch in _INVISIBLES:
            text = text.replace(ch, "")
    else:
        raise ValueError(f"unknown zwnj mode: {zwnj!r}")
    text = text.lower()
    return _WHITESPACE_RE.sub(" ", text).strip()


def search_variants(text: str | None) -> str:
    """Return a searchable string covering the spellings people type.

    Contains the normalised text with ZWNJ as space ("سریع خوان"), with ZWNJ removed
    ("سریعخوان") and a fully compact form without spaces, so that "سریع‌خوان", "سریع خوان" and
    "سریعخوان" all find each other with a substring match.
    """
    spaced = normalize_persian(text, zwnj="space")
    if not spaced:
        return ""
    joined = normalize_persian(text, zwnj="remove")
    compact = spaced.replace(" ", "")
    parts: list[str] = []
    for part in (spaced, joined, compact):
        if part not in parts:
            parts.append(part)
    return " ".join(parts)


def tokenize_query(query: str | None) -> list[str]:
    """Normalise a search query and split it into tokens (ZWNJ treated as space)."""
    return [t for t in normalize_persian(query, zwnj="space").split(" ") if t]
