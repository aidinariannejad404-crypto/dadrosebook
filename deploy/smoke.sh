#!/usr/bin/env bash
# Post-deploy smoke test. Checks status codes of the key public URLs.
#
#   deploy/smoke.sh https://dadrosebook.com
#   SMOKE_PRODUCT_SLUG=<slug> SMOKE_OLD_URL=/products deploy/smoke.sh https://dadrosebook.com
#   CURL_OPTS=-k deploy/smoke.sh https://localhost      # self-signed / internal CA
#
# SMOKE_OLD_URL: an old Sazito URL that must answer 301 (default /products, seeded redirect).
set -euo pipefail

BASE="${1:-${SMOKE_BASE_URL:-}}"
if [[ -z "$BASE" ]]; then
  echo "usage: $0 https://<site-domain>" >&2
  exit 2
fi
BASE="${BASE%/}"
OLD_URL="${SMOKE_OLD_URL:-/products}"
read -r -a CURL_EXTRA <<< "${CURL_OPTS:-}"

failures=0

status_of() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${CURL_EXTRA[@]}" "$1" || echo 000
}

check() {
  local label="$1" url="$2" expected="$3" got
  got="$(status_of "$url")"
  if [[ "$got" == "$expected" ]]; then
    printf 'ok    %-14s %s → %s\n' "$label" "$url" "$got"
  else
    printf 'FAIL  %-14s %s → %s (expected %s)\n' "$label" "$url" "$got" "$expected"
    failures=$((failures + 1))
  fi
}

check health "$BASE/api/v1/health/" 200
check home "$BASE/" 200

slug="${SMOKE_PRODUCT_SLUG:-}"
if [[ -z "$slug" ]]; then
  # First book from the API (python3 is on every Ubuntu server).
  slug="$(curl -sS --max-time 20 "${CURL_EXTRA[@]}" "$BASE/api/v1/catalog/books/?page_size=1" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("results", d); print(r[0]["slug"] if r else "")' \
    2>/dev/null || true)"
fi
if [[ -n "$slug" ]]; then
  encoded="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$slug")"
  check product "$BASE/product/$encoded" 200
else
  echo "FAIL  product        could not find a product slug (set SMOKE_PRODUCT_SLUG)"
  failures=$((failures + 1))
fi

check robots "$BASE/robots.txt" 200
check sitemap "$BASE/sitemap.xml" 200
check admin "$BASE/admin/login/" 200
check old-url "$BASE$OLD_URL" 301

# www → apex
host="${BASE#https://}"
host="${host#http://}"
if [[ "$host" != www.* && "$host" != localhost* ]]; then
  check www "https://www.$host/" 301
fi

if ((failures > 0)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
