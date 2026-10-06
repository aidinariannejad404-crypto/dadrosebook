# Phase 3 summary — ورود، پرداخت و سفارش

Branch `claude/phase-3-52vurk` (PR #3), stacked on `phase-1` with the Phase 2 branch merged in.
Contract: `docs/api-contract-phase-3.md`. Screenshots: `docs/screenshots/phase-3/`.

## Built

- **Login** (`/login`, also step 1 of checkout): phone + 5-digit SMS code, Persian digits accepted,
  resend countdown, rate limits (60 s resend, 5/hour per phone, per-IP throttle, 5 wrong tries burn a
  code). Only an HMAC of the code is stored. httpOnly JWT cookies (15 min access, 30-day rotating refresh,
  revoked on logout). Console SMS provider; codes appear in `docker compose logs backend` in dev.
- **Checkout** (`/checkout`): 3 steps ورود → ارسال → پرداخت; login is skipped when signed in and shipping
  is skipped for ebook-only orders. Saved addresses or a new one inline, shipping methods (پست پیشتاز,
  پیک تهران only for Tehran, free-shipping threshold from store settings), discount code with inline errors,
  sticky total bar on mobile. Items come from the Phase 2 cart or a quick-buy link on the product page.
  Prices are recomputed on the server; double clicks create one order.
- **Payments**: `PaymentGateway` interface, ZarinPal v4 sandbox (default) and a local `fake` gateway for
  offline dev (`PAYMENT_GATEWAY=fake`). Idempotent, row-locked verify with our own stored amount; every
  payment state change is logged (`PaymentLog`). Cancelled or declined attempts keep the order payable
  (retry button); unpaid orders auto-cancel after 60 minutes (Celery beat).
- **Orders**: numbers like `DR0507114821`, full price/address snapshots, status timeline, admin actions
  (آماده‌سازی، ارسال‌شده with tracking code + SMS، تحویل‌شده، لغو). Marking paid decrements stock, records the
  discount, grants ebooks, bumps bestseller counts, SMSes the customer, clears cart lines and counts
  back-in-stock conversions.
- **Ebook entitlements**: `apps.library` (`EbookFile` on private storage, `EbookEntitlement`,
  `has_entitlement()` / `has_ebook_entitlement()` for the Phase 4 reader). Granted in the same transaction
  as the payment; manual grant/revoke in the admin.
- **Account** (`/account`): dashboard with name edit, orders + order detail (timeline, tracking link, pay
  again, «مطالعه» links), addresses, «کتابخانه من», wishlist, my reviews, logout.
- **Reviews** (moderated in the admin; verified-purchase badge; average shown from 3 reviews; JSON-LD
  aggregateRating) and a **wishlist** heart on the product page.
- **Admin**: new «فروش» and «نظرات کاربران» sidebar groups (orders, payments, discount codes and their
  uses, shipping methods, ebook files and entitlements, reviews, wishlists, login codes, addresses).

## Verified

- Backend: full pytest suite green, `ruff check` + `ruff format --check` clean, no missing migrations.
- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (176 tests) clean.
- Real browser run at 360 px and 1366 px against the live API with the fake gateway: login with an SMS
  code, ebook purchase → paid → book in the library, print purchase with a new address and shipping →
  bank cancel → retry offered, account pages.
- `docker compose up --build` brings up db, redis, backend, worker (with beat) and frontend.

## Skipped / later

- «خبرم کن» list in the account area (Phase 2 owns the back-in-stock model; easy follow-up).
- New users are not prompted for their name during checkout (they can add it on the dashboard).
- Tested only against the fake gateway here: the sandbox can't be reached from this build environment.
  Run once with `PAYMENT_GATEWAY=zarinpal` before launch.

## Decisions for the owner

1. **Shared book + course cart**: not built. It needs order/enrolment integration with the dadrose.com
   academy; courses stay link-out with UTM until then.
2. **Real SMS provider** (Kavenegar or sms.ir) and its OTP template: needs an account (paid).
3. **ZarinPal merchant ID** for production, and whether to add a second gateway later.
4. **Shipping prices**: seeded at 45٬000 (پست پیشتاز) and 65٬000 (پیک تهران); editable in the admin.
