# Phase 2 summary — discovery, study kit, cart, back-in-stock

## How to run

```bash
cp .env.example .env      # new keys: SITE_URL, CART_MAX_QUANTITY, CART_TTL_DAYS, BACK_IN_STOCK_THROTTLE_RATE
docker compose up --build
```

New pages: http://localhost:3000/search?q=مدنی · /category/<slug> · /kit · /cart. API contract:
`docs/api-contract-phase-2.md`. Screenshots: `docs/screenshots/phase-2/`.

## What was built

**Backend**
- `apps.cart`: guest carts identified by a UUID token (`X-Cart-Token` header or `dadrose_cart_token`
  cookie). Add / change quantity / remove / bulk add (whole kit) / clear. Rules: ebook quantity 1,
  quantity ≤ min(stock, 10), adding a bundle replaces the same book's ebook, placeholder prices and
  out-of-stock print are refused, reads flag stock problems without changing the cart. Locked rows on
  every change. Merge on login through Django's `user_logged_in` signal (Phase 3 only needs to log the
  user in); bought lines are removed when Phase 3's `orders.signals.order_paid` fires. Stale guest
  carts: `manage.py purge_carts` / Celery task. Admin «فروش › سبدها».
- `apps.engagement`: «موجود شد خبرم کن» requests (phone, variant, source). Idempotent, throttled
  (10/hour/IP). When a print or bundle variant's stock goes from 0 to more than 0, a Celery task SMSes
  every pending request through `SmsProvider` (console for now) and marks them notified. Admin list
  with filters, pending counts and «اطلاع‌رسانی اکنون». `mark_converted()` is ready for Phase 3 to
  record out-of-stock recovery.
- Catalog: `GET /catalog/books/facets/` (filter counts, each facet ignoring its own filter, price
  range without placeholder prices), `GET /catalog/search/suggest/` (books, subjects, categories,
  authors; ي/ك/ZWNJ-insensitive) and a relaxed fallback for multi-word searches with no exact hit.

**Storefront**
- `/search` and `/category/<slug>`: SSR, filters (subject, exam, format, resource type, in stock,
  price) as plain links so they work without JS, mobile bottom sheet with an active-filter count,
  sort, filter chips, Persian pagination, empty and zero-result states with suggestions,
  JSON-LD BreadcrumbList + ItemList, canonical and `noindex` for filtered pages.
- Header search box with live suggestions (accessible combobox, keyboard support).
- `/kit`: choose exam → subjects ordered by ضریب → recommended books (essential pre-selected) with a
  format per book (bundle by default when available), live total and savings, exam countdown,
  shareable URL (`/kit?exam=…&s=…`), «افزودن همه به سبد» in one request; fires `kit_built`.
- `/cart`: lines with stepper, remove, per-line stock/price warnings, free-shipping progress, savings,
  sticky mobile total, checkout button (disabled while a line has a problem; `/checkout` is a
  placeholder until Phase 3). Live cart badge in the header.
- Product page: real add-to-cart (`add_to_cart` event); notify-me is a real phone form
  (`notify_me_requested` fires only on success). Book cards link to the product page for notify-me.

## Checks
- Backend: 471 tests pass, `ruff check` and `ruff format --check` clean.
- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (121 tests) pass.
- `docker compose up` brought up all five services healthy; browser run against the real API at
  360px: search, suggestions, category, kit → add all → cart, no horizontal scroll, no console errors.

## Skipped / follow-ups
- No Celery beat yet, so `purge_stale_carts` runs only when called (command or task). Add beat in Phase 5.
- Stock changes made with `QuerySet.update()` (bulk imports) don't trigger restock SMS; admin and
  `save()` do.
- Real SMS provider waits for the owner's choice (paid service).
- The selected-exam cookie is not applied to search/category lists, because `exam_type` filters
  books as well as filling «ضروری کیت». A separate "kit role only" parameter would allow it.

## Decisions for the owner
1. SMS provider for back-in-stock and OTP (Kavenegar or sms.ir; paid) — same choice as Phase 3.
2. Should `/kit` default every book to the print + ebook bundle (current default when it exists) or
   to print only? The bundle raises order value; print is cheaper for the buyer.
