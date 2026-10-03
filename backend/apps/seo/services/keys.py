"""Pure path helpers shared by redirects and 404 tracking.

``redirect_key`` has a TypeScript twin (``redirectKey`` in the frontend middleware); both follow
``docs/phase-5-contract.md`` §1 and must produce the same key for the same input.
"""

import re
from urllib.parse import unquote, urlsplit

ZWNJ = "‌"
MAX_DECODE_ROUNDS = 3

# Letter fixes only (not the full ``normalize_persian``): digits, ZWNJ and spaces stay meaningful.
_LETTER_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})
_ASCII_LOWER = str.maketrans({chr(c): chr(c + 32) for c in range(ord("A"), ord("Z") + 1)})
_SLASHES_RE = re.compile(r"/{2,}")


def strip_query(path: str) -> str:
    """Drop the query string and the fragment."""
    return re.split(r"[?#]", path, maxsplit=1)[0]


def decode_path(path: str) -> str:
    """URL-decode repeatedly (double-encoded links exist in the wild) until stable, max 3 times."""
    for _ in range(MAX_DECODE_ROUNDS):
        decoded = unquote(path)
        if decoded == path:
            break
        path = decoded
    return path


def redirect_key(path: str) -> str:
    """Lookup key for a request path.

    1. drop query string and fragment; 2. URL-decode until stable (max 3 rounds);
    3. ي/ى→ی، ك→ک, spaces and ZWNJ → ``-``; 4. lowercase ASCII, collapse repeated ``/``,
    strip the trailing ``/`` (root stays ``/``).
    """
    path = decode_path(strip_query(path or ""))
    path = path.translate(_LETTER_MAP).replace(" ", "-").replace(ZWNJ, "-")
    path = _SLASHES_RE.sub("/", path.translate(_ASCII_LOWER))
    if len(path) > 1:
        path = path.rstrip("/") or "/"
    return path or "/"


def clean_path(value: str) -> str:
    """Stored form of a path typed or imported by a person.

    Accepts a full URL (``https://dadrosebook.com/product/…``) or a path; returns the decoded
    path without query/fragment, always starting with ``/``. Letters are kept as typed.
    """
    value = (value or "").strip()
    if value.lower().startswith(("http://", "https://", "//")):
        value = urlsplit(value).path or "/"
    value = decode_path(strip_query(value)).strip()
    if not value.startswith("/"):
        value = "/" + value
    return value
