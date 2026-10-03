#!/usr/bin/env bash
# Subset the Vazirmatn variable font to the glyphs the store uses (Persian/Arabic letters, Persian
# and ASCII digits, Latin-1, punctuation, ZWNJ and bidi controls). Cuts the preloaded font from
# ~111 KB to ~69 KB, which shortens LCP on slow mobile connections.
# Needs: pip install fonttools brotli. Usage: scripts/subset-font.sh path/to/Vazirmatn[wght].woff2
# (the full upstream file; never subset an already subset file).
set -euo pipefail
src=${1:?path to the full Vazirmatn variable woff2}
out="$(dirname "$0")/../src/fonts/Vazirmatn-wght.woff2"
pyftsubset "$src" \
  --unicodes="U+0020-007E,U+00A0-00FF,U+060C,U+061B,U+061F,U+0621-063A,U+0640-0655,U+0660-066D,U+0670,U+067E,U+0686,U+0698,U+06A9,U+06AF,U+06BE,U+06C0,U+06CC,U+06F0-06F9,U+200C-200F,U+2010-2027,U+202A-202E,U+2030,U+2066-2069,U+2122,U+2212,U+FEFF" \
  --layout-features='*' --flavor=woff2 --output-file="$out"
ls -l "$out"
