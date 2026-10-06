# CLAUDE.md — conventions for فروشگاه کتاب دادرُز

Read `PLAN.md` first: it holds the architecture, models, API, pages and phase status. Update its status
table when a phase finishes.

## Stack
- `/backend`: Django 5 + DRF, PostgreSQL, Redis, Celery, django-unfold admin (Persian/RTL), django-storages (S3 / ArvanCloud).
- `/frontend`: Next.js 15 App Router, TypeScript, Tailwind CSS.
- `docker compose up --build` runs everything (db, redis, backend, worker, frontend).

## Language and direction
- All UI text is Persian. `<html dir="rtl" lang="fa">`. No English version.
- Use logical utilities only: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/text-end`, `border-s/e`.
  Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right` (lint by grep before committing).
- Font: Vazirmatn, self-hosted (`frontend/src/fonts`, `next/font/local`; admin uses `backend/static/fonts`). No Google Fonts or other external font CDNs.

## Money
- Stored as **integer toman** in the DB and API (`PositiveIntegerField`/`int`). No floats, no decimals.
- Display with Persian digits and thousands separators: `۲٬۲۰۰٬۰۰۰ تومان` (`formatToman()` in `frontend/src/lib/format.ts`, `apps.core.money.format_toman` in Python).
- Convert to Rial (×10) **only** inside the payment gateway adapter.

## Dates
- Store Gregorian / UTC. Display Jalali: `jdatetime` on the backend, `date-fns-jalali` on the frontend.
- Admin date inputs for business dates accept Jalali (`apps.core.forms.JalaliDateField`).

## Persian text
- One normaliser: `apps.core.normalize.normalize_persian()` (ي→ی، ى→ی، ك→ک، ۀ→ه، diacritics and tatweel stripped, digits → ASCII, ZWNJ handled, whitespace collapsed). Use it for search, slugs and phone numbers. It is tested; extend the tests when you change it.
- Slugs: `apps.core.slugs.persian_slugify()` — Unicode Persian slugs, ZWNJ and spaces become `-`.
- URL patterns `/product/<slug>` and `/category/<slug>` are fixed (Sazito SEO parity; 301s added in Phase 5).

## Brand and design
- Brand tokens live **only** in `frontend/src/styles/tokens.css` (CSS variables) and are mapped in `tailwind.config.ts`. Placeholders: primary `#12264A`, accent `#C8A24B`, background `#F5F6F9`, text `#10182B`.
- Subject colour coding is a core feature: `Subject.color` is used on covers, tiles and tags. Use `SubjectTag`/`BookCover` components rather than ad-hoc colours.
- Mobile first: design at 360px, then scale up.

## Accessibility (WCAG 2.1 AA)
- Real `<button>`/`<a>`, labels on every input, visible focus, touch targets ≥ 44px (`min-h-11 min-w-11`), text contrast ≥ 4.5:1. Accent gold is for backgrounds/borders on dark or with dark text, never small text on white.

## Backend code
- Business logic in `apps/<app>/services/` (plain functions). Views and serializers stay thin.
- Tests: pytest-django, next to the app (`apps/<app>/tests/`). Every service gets tests.
- Lint: `ruff check . && ruff format --check .`.
- Settings: `config/settings/{base,dev,prod,test}.py`; `DJANGO_SETTINGS_MODULE` chooses.
- Integrations behind interfaces (`SmsProvider`, `PaymentGateway`); ask the owner before adding any paid third-party service.
- Ebook files go to the private storage only; never expose a public URL to them.

## Frontend code
- Server components by default; `"use client"` only for interactivity. Catalog pages are SSR/ISR with `generateMetadata`.
- API access through `src/lib/api.ts` (server uses `API_INTERNAL_URL`, browser uses `NEXT_PUBLIC_API_URL`).
- Lint/test: `npm run lint && npm run typecheck && npm test`.

## Secrets
- `.env` (copy from `.env.example`). Never commit secrets.
- **No static crypto keys or IVs in the frontend bundle** (PF-16; Fidibo's hard-coded keys are public on GitHub).
  Offline reading uses a non-extractable WebCrypto key generated per browser plus server-issued, time-boxed
  licences; keep it that way. `npm run lint` runs `scripts/check-crypto-keys.mjs` and the backend test
  `apps/core/tests/test_frontend_crypto_guard.py` scans `frontend/src` too. Rotate the offline-licence signing
  secret periodically.

## Notifications and SMS (platform stream)
- Store SMS go through `apps.accounts.sms.deliver_sms` (the `send_sms` task) with their `sms_catalog` kind and a
  same-site deep link: that copies them into «پیام‌های من» (`apps.inbox`) and honours the customer's opt-outs
  (marketing kinds only). Login codes use `SmsProvider.send_otp` on the provider's service/verify line, never the
  bulk line.

## Definition of done for a phase
Runs with one `docker compose up --build`; backend tests + lint, frontend lint + typecheck + tests pass;
pages work on mobile and desktop in RTL; `PLAN.md` updated; short summary in `docs/` (built, skipped, decisions needed).
