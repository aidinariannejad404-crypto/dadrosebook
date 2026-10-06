"""PF-16: no hard-coded crypto keys or IVs in the storefront bundle (frontend/src).

Mirrors ``frontend/scripts/check-crypto-keys.mjs`` (``npm run lint:crypto``) so backend CI catches
it too. Skipped when the frontend is not checked out next to the backend (e.g. the backend image).
"""

import re
from pathlib import Path

import pytest

FRONTEND_SRC = Path(__file__).resolve().parents[4] / "frontend" / "src"

NAME = r"(?:key|iv|nonce|salt|secret|aes|cipher)\w*"
PATTERNS = [
    # const AES_KEY = "0123…"  /  iv: "…"  (hex ≥ 16 bytes or base64 ≥ 16 bytes)
    re.compile(
        rf"(?i)\b{NAME}\s*[:=]\s*[\"'`](?:[0-9a-f]{{32,}}|[A-Za-z0-9+/]{{22,}}={{0,2}})[\"'`]"
    ),
    # const iv = new Uint8Array([1, 2, 3, …])  (8+ literal bytes)
    re.compile(rf"(?i)\b{NAME}\s*[:=]\s*new\s+Uint8Array\(\s*\[\s*(?:\d+\s*,\s*){{7,}}"),
    # importKey("raw", <literal>…)
    re.compile(r"importKey\(\s*[\"']raw[\"']\s*,\s*(?:new\s+Uint8Array\(\s*\[|[\"'`])"),
    # CryptoJS.enc.Utf8.parse("…") / enc.Hex.parse("…") key material
    re.compile(r"enc\.(?:Utf8|Hex|Base64)\.parse\(\s*[\"'`]"),
]
ALLOW = "crypto-guard: allow"


def scan(text: str) -> list[int]:
    """Line numbers (1-based) that look like embedded key material."""
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if ALLOW in line:
            continue
        if any(p.search(line) for p in PATTERNS):
            hits.append(i)
    return hits


@pytest.mark.parametrize(
    "line",
    [
        'const AES_KEY = "00112233445566778899aabbccddeeff";',
        "const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);",
        'await crypto.subtle.importKey("raw", new Uint8Array([1,2,3]), "AES-GCM", false, []);',
        'const k = CryptoJS.enc.Utf8.parse("sixteen byte key");',
        "secretKey: 'c2l4dGVlbiBieXRlIGtleSEhIQ==',",
    ],
)
def test_detects_static_keys(line):
    assert scan(line) == [1]


@pytest.mark.parametrize(
    "line",
    [
        "const iv = crypto.getRandomValues(new Uint8Array(12));",
        'const key = await crypto.subtle.generateKey({ name: "AES-GCM" }, false, ["encrypt"]);',
        'export const READER_THEME_KEY = "dadrose.reader.theme";',
        'const key = "0011223344556677889900aabbccddeeff"; // crypto-guard: allow (test vector)',
    ],
)
def test_ignores_normal_code(line):
    assert scan(line) == []


@pytest.mark.skipif(not FRONTEND_SRC.is_dir(), reason="frontend not checked out")
def test_frontend_has_no_static_crypto_keys():
    offences = []
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if path.suffix not in {".ts", ".tsx", ".js", ".mjs"} or "__fixtures__" in path.parts:
            continue
        if path.name.endswith((".test.ts", ".test.tsx")):
            continue
        for line in scan(path.read_text(encoding="utf-8")):
            offences.append(f"{path.relative_to(FRONTEND_SRC)}:{line}")
    assert offences == [], "hard-coded crypto key/IV in the frontend:\n" + "\n".join(offences)
