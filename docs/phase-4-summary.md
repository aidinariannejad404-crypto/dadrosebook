# Phase 4 summary — کتابخوان امن (secure ebook reader)

Branch `claude/phase-4-4y1bmp`, draft PR #2, stacked on the Phase 3 branch (`claude/phase-3-52vurk`,
which owns `EbookFile`, `EbookEntitlement` and cookie JWT auth).

## How to run

```bash
cp .env.example .env
docker compose up --build
```

On start the backend also runs `seed_demo_ebooks --if-empty`, which attaches a 6-page sample PDF to three
bestsellers (the imported catalogue has no ebook variants yet). Staff can open them at `/read/<slug>`; a customer
needs an entitlement (`apps.library.services.entitlements.grant(user, book)` or a paid order).

Checks (all passing):

```bash
cd backend  && ruff check . && ruff format --check . && pytest       # reader: 54 tests
cd frontend && npm run lint && npm run typecheck && npm test          # 106 tests (21 reader)
```

Verified end to end with `docker compose up`: through the storefront's `/api/v1` proxy an entitled user gets the
reader session, the signed file streams as `inline`, `no-store` PDF, an anonymous request gets 401 and a
non-owner 403. Screenshots: `docs/screenshots/reader-*.png` (360px and 1280px).

## What was built

**Backend (`apps.reader`).**
- `GET /library/<slug>/read/`: checks the entitlement, picks the book's newest active `EbookFile`, and returns a
  5-minute signed URL (`READER_URL_TTL_SECONDS`), saved progress and a watermark (masked phone + Jalali date).
  Production (`USE_S3=true`) uses an S3 pre-signed URL on the private bucket; locally a signed token URL.
- `GET /library/files/<token>/`: streams the file only if the token is unexpired and untampered, the file is still
  active and at the same version, and the user still has the entitlement (refunds revoke access immediately).
- Reading progress (`GET/PUT`) and highlights (`GET/POST/PATCH/DELETE`), all per user and re-checking the
  entitlement on every call. Rects are validated and clamped server side.
- Admin: «فایل‌های کتاب الکترونیک» upload screen (content checked by magic bytes, saving an active file
  deactivates the previous one), read-only progress and highlights lists.
- Entitlement check is a swappable setting (`READER_ENTITLEMENT_CHECKER`), default Phase 3's `has_entitlement`.

**Frontend (`/read/[slug]`).** Full-screen RTL reader on pdf.js: one page at a time (plus next pre-render),
fit-to-width with zoom, page jump with Persian digits, RTL keys and swipe, resume from saved progress, debounced
progress saves (and on tab hide), text-selection highlights in four colours with notes, a highlights drawer grouped
by page, watermark drawn into the page pixels, print and context menu blocked, `noindex`. Friendly states for
login required (`/login?next=/read/<slug>`), not owned (link to the product page), no ebook yet, EPUB, network error.

## Skipped / limits
- EPUB rendering (EPUB files can be uploaded; the reader shows «به‌زودی»).
- The whole PDF reaches the browser once per session; a determined user can still capture it from devtools.
  Page-image rendering on the server would be stronger but needs a PDF rasteriser and much more storage/CPU.
- No keyboard-only way to create a highlight (editing existing ones works by keyboard).
- No offline reading.

## Decisions for the owner
1. **Real ebook files and prices**: the imported catalogue sells print only; ebook variants and files need to be
   added in the admin before launch.
2. **Production bucket CORS**: the private ArvanCloud bucket must allow `GET` from the storefront origin so pdf.js
   can fetch the pre-signed URL.
3. **Staff preview** (`READER_STAFF_PREVIEW=true`) lets any staff user open every ebook. Keep it, or limit it?
