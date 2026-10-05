"""One-to-one text folding for in-book search.

Every character maps to exactly one character, so an offset in the folded text is the same offset in
the original. The reader (``foldText`` in ``frontend/src/lib/reader.ts``) folds the same way and
finds the ``occurrence``-th match itself.
"""

_MAP = {
    "ي": "ی",
    "ى": "ی",
    "ك": "ک",
    "‌": " ",  # ZWNJ: «می‌شود» matches «می شود»
    **{chr(0x06F0 + i): str(i) for i in range(10)},
    **{chr(0x0660 + i): str(i) for i in range(10)},
}


def _fold_char(ch: str) -> str:
    mapped = _MAP.get(ch)
    if mapped is not None:
        return mapped
    lower = ch.lower()
    return lower if len(lower) == 1 else ch


def fold(text: str) -> str:
    return "".join(_fold_char(ch) for ch in text)


def utf16_len(text: str) -> int:
    """Length in UTF-16 code units (what JavaScript string indices count)."""
    return len(text.encode("utf-16-le")) // 2
