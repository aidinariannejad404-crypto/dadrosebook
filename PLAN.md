# PLAN — فروشگاه کتاب دادرُز (Dadrose Book)

Online store for Iranian law students and bar-exam candidates: print books, ebooks and
print + ebook bundles, organised around exams (کانون وکلا، مرکز وکلا، قضاوت، سردفتری، ارشد و دکتری).
It replaces the current Sazito store at dadrosebook.com.

Status legend: ✅ done · 🚧 in progress · ⏳ planned

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold, docker-compose, Django settings split, unfold admin (fa/RTL), catalog models + admin, read-only catalog API, Persian normalisation, seed data, Next.js RTL shell, homepage, product page | ✅ |
| 2 | Category/search page, study-kit builder, cart (guest + merge), back-in-stock requests | ✅ |
| 3 | OTP auth, checkout, shipping, discount codes, ZarinPal, orders, account pages, ebook entitlements, reviews, wishlist | ✅ |
| 4 | Secure ebook reader, reading progress, highlights (`apps.reader`, `/read/<book>`) | ✅ |
| 5 | SEO hardening, Sazito 301s, performance, analytics events, production deployment | ⏳ |
| 6 | Ebook platform: EPUB streamed chapter by chapter (never the whole file), reflowable reader with typography settings, TOC, in-book search, bookmarks, copy limit with citation and a server-side 10% copy quota, paged and scroll modes, notebook export, «my devices» page, encrypted offline reading (3 books, 14 days), 3-device limit, anti-scraping throttles, access log (see `docs/ebook-platform-summary.md`, research in `docs/ebook-research.md`) | ✅ |
| UI | Visual refresh: logo system, sticky header, mobile tab bar, mega menu, enclosed checkout, richer cards and 3D covers, product page (collapsible description, cover lightbox, added-to-cart sheet, complete-the-kit box), policy pages, library progress, reader themes (see `docs/ui-refresh-summary.md`) | ✅ |
| Admin | Back office, step 1: dashboard (work queue, KPIs, goal metrics), sales report + CSV, staff roles, audit log, order print/CSV, quick price/stock edit, customer summary, admin session timeout (`apps.backoffice`, see `docs/admin-panel-summary.md`); step 2: returns/refunds (`orders.ReturnRequest`), staff SMS 2FA + admin IP allowlist, editable SMS templates (`core.SmsTemplate`), abandoned-cart reminders; next: shipment API (paid), formal invoices | 🚧 |
| Growth | Research package «و»: Torob API v3 + meta tags + Emalls feed, shareable kit links, gift by link, partner codes report, exam-calendar campaigns with auto-applied discount (`apps.growth`, see `docs/growth-summary.md`) | ✅ |
| 2 | Category/search page, study-kit builder, cart (guest + merge), back-in-stock requests | ⏳ |
| 3 | OTP auth, checkout, shipping, discount codes, ZarinPal, orders, account pages, ebook entitlements | ⏳ |
| 4 | Secure ebook reader, reading progress, highlights | ⏳ |
| 5 | SEO hardening, Sazito 301s, performance, analytics events, production deployment config (see `docs/phase-5-summary.md`, `docs/deploy.md`) | ✅ (real deployment waits for the hosting decision) |

---

## 1. Architecture

```
            ┌──────────────── browser (mobile first) ────────────────┐
            │  Next.js 15 (App Router, RSC, ISR) — Persian RTL UI     │
            └───────────────┬────────────────────────────────────────┘
                            │ server-side fetch (API_INTERNAL_URL) / client fetch (NEXT_PUBLIC_API_URL)
            ┌───────────────▼────────────────┐       ┌──────────────┐
            │ Django 5 + DRF  (/api/v1/…)    │──────▶│ PostgreSQL 16│
            │ django-unfold admin (/admin/)  │       └──────────────┘
            │ services/ = business logic     │       ┌──────────────┐
            └───────┬────────────────────────┘──────▶│ Redis 7      │ cache + Celery broker
                    │                                └──────┬───────┘
            ┌───────▼────────┐                       ┌──────▼───────┐
            │ S3 (ArvanCloud)│ public: covers        │ Celery worker│ SMS, email, jobs
            │                │ private: ebook files  └──────────────┘
            └────────────────┘
```

Key decisions

- **Catalog pages are server-rendered** by Next.js (RSC + `revalidate`), reading the DRF API over the
  internal docker network. Interactive bits (format switcher, countdown) are small client components.
- **Business logic lives in `services` modules**, views/serializers stay thin. Tests target services.
- **Search** (Phase 1–2): each `Book` stores a denormalised, Persian-normalised `search_text`
  (title, subtitle, authors, translators, publisher, subjects, ISBN). Queries are normalised with the
  same function and matched token-by-token. Upgrade path: Postgres `pg_trgm` for typo tolerance
  (no new service needed).
- **Money** is an integer number of toman everywhere in the DB and API. Rial conversion only inside
  the payment gateway adapter (Phase 3).
- **Dates** are stored as Gregorian (`DateField`/UTC `DateTimeField`) and shown as Jalali. The admin
  accepts Jalali input (`۱۴۰۵/۰۸/۱۴`) through a custom form field that converts to Gregorian.
- **Files**: `STORAGES` is switched by env. Dev uses local disk (`media/` public, `private_media/`
  private, never served). Prod uses django-storages S3 backends pointed at ArvanCloud: one public
  bucket for covers/samples, one private bucket for ebook files (signed URLs only, Phase 4).
- **Covers without an image** are rendered as a generated "subject-colour cover" in the frontend so the
  catalog looks complete before real cover scans are uploaded.
- **Integrations behind interfaces**: `SmsProvider` (console → Kavenegar/sms.ir), `PaymentGateway`
  (ZarinPal with sandbox, more later).

## 2. Folder structure

```
dadrosebook/
├── docker-compose.yml          # db, redis, backend, worker, frontend
├── .env.example                # copy to .env
├── PLAN.md  CLAUDE.md  README.md
├── docs/phase-1-summary.md
├── backend/
│   ├── Dockerfile  entrypoint.sh  pyproject.toml (ruff + pytest)  requirements*.txt
│   ├── manage.py
│   ├── config/
│   │   ├── settings/{base,dev,prod,test}.py
│   │   ├── urls.py  celery.py  wsgi.py  asgi.py
│   ├── static/fonts/            # Vazirmatn for the admin
│   └── apps/
│       ├── core/               # normalize.py, slugs.py, jalali.py, money.py, storages, admin forms, TimeStamped
│       ├── catalog/            # models, admin, api (serializers/filters/views), services/, seed command, tests
│       ├── content/            # Banner, GuideVideo (homepage, admin-managed)
│       ├── leads/              # Lead (study-plan lead magnet), study plan generator, CSV export
│       ├── accounts/   (P3)    # User (phone), OTP, SmsProvider
│       ├── cart/       (P2)
│       ├── orders/     (P3)    # Order, OrderItem, Address, ShippingMethod, DiscountCode, StoreSettings
│       ├── payments/   (P3)    # Payment, PaymentGateway, zarinpal
│       ├── library/    (P3)    # EbookFile, EbookEntitlement (+ services/entitlements.has_entitlement)
│       ├── reader/     (P4)    # ReadingProgress, Highlight, signed file URLs
│       ├── engagement/ (P2)    # BackInStockRequest
│       ├── backoffice/ (Admin) # dashboard + sales report services, staff roles, audit log admin
│       ├── reviews/    (P3)    # Review (moderated)
│       ├── wishlist/   (P3)    # WishlistItem
│       └── seo/        (P5)    # Redirect (old Sazito path → new path)
└── frontend/
    ├── Dockerfile  package.json  tailwind.config.ts  next.config.ts  eslint.config.mjs
    └── src/
        ├── app/                # layout.tsx, page.tsx, product/[slug], category/[slug] (P2), kit (P2) …
        ├── components/         # layout/, home/, product/, book/, ui/
        ├── lib/                # api.ts, types.ts, format.ts (digits, toman, jalali), config
        ├── fonts/              # Vazirmatn variable woff2 (self-hosted, next/font/local)
        └── styles/tokens.css   # brand tokens (CSS variables) — the one place to change colours
```

## 3. Data models

Common: every model has `created_at`/`updated_at` (`TimeStampedModel`). Slugs are Unicode Persian
(`persian_slugify`), unique.

### Catalog (Phase 1)

| Model | Fields | Notes |
|---|---|---|
| **ExamType** | name, slug, short_name, order, is_active | Seed: کانون وکلا، مرکز وکلا، قضاوت، سردفتری، ارشد و دکتری |
| **Subject** | name, slug, color (hex), order, description, is_active | Colour drives covers, tiles, tags |
| **Category** | name, slug, parent (self FK), order, description, is_active | Tree; `/category/<slug>` |
| **Person** | name, slug, bio, photo | Authors and translators |
| **Publisher** | name, slug, website | |
| **Book** | title, subtitle, slug, authors (M2M Person), translators (M2M Person), publisher (FK, null), subjects (M2M), exam_types (M2M), categories (M2M), edition, publish_year (Jalali year int), volumes, pages, isbn, description (sanitised HTML), table_of_contents, study_plan_note ("جایگاه در برنامه مطالعه"), cover (public image), sample_pdf (public file), intro_video_url, related_courses (M2M), is_featured, is_quick_review (سریع‌خوان), sales_count (denormalised, bestseller rail), is_active, search_text (auto) | `search_text` rebuilt on save and on M2M change |
| **BookSamplePage** | book, image, order | "ورق بزنید" viewer |
| **BookVariant** | book, type (PRINT/EBOOK/BUNDLE), price, sale_price (null), stock (print/bundle only), is_active, price_is_placeholder | unique (book, type); `effective_price`, `in_stock`; BUNDLE stock = print stock |
| **RelatedCourse** | title, url, price, image, is_active, order | External Dadrose course, cross-sell |
| **ExamEvent** | name, exam_type (FK), date, is_active | Next upcoming → homepage countdown |
| **StudyKitRecommendation** | exam_type, subject, note, is_active | unique (exam_type, subject) |
| **StudyKitItem** | recommendation, book, order, is_essential | Ordered book list |

### Content (Phase 1)

| Model | Fields |
|---|---|
| **Banner** | placement (HERO / COURSE), title, subtitle, image, link_url, link_label, order, is_active |
| **GuideVideo** | title, video_url, thumbnail, subject (null), exam_type (null), order, is_active — "کدام کتاب را بخوانم؟" |

### Later phases

- **User** (P3): phone (unique, normalised `09xxxxxxxxx`), first/last name, is_staff… custom user model
  is created in Phase 1 already (`accounts.User`, `USERNAME_FIELD = phone`) because swapping later is painful.
- **OtpCode** (P3): phone, code hash, expires_at, attempts — rate-limited in Redis.
- **Cart / CartItem** (P2): cart by `cart_id` cookie (UUID) or user; merged on login (`cart.services.merge`).
- **Address, ShippingMethod** (rules: base price, free over threshold, Tehran-only for پیک, ebook-only orders skip),
  **StoreSettings** (singleton: free-shipping threshold, support phone), **DiscountCode** (percent/fixed, min order,
  max uses, per-user limit, validity window, scope by subject/format).
- **Order / OrderItem** (P3): number, user, status (PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED; CANCELLED/FAILED),
  snapshot of prices, shipping address snapshot, tracking code. OrderItem snapshots title/variant type/unit price.
- **Payment** (P3): order, gateway, amount_rial, authority (unique), ref_id, status, raw_request/raw_response JSON,
  `PaymentLog` row for every state change. Verify is idempotent via `select_for_update` + unique authority.
- **EbookFile** (P3/4): book, format (PDF/EPUB), file on private storage, version.
- **EbookEntitlement** (P3): user + book unique, source order; created in the same transaction that marks an order PAID.
- **ReadingProgress** (P4, `apps.reader`): user + book unique, page, total_pages, location (EPUB CFI), `percent` computed.
- **Highlight** (P4): user, book, page, text, note, color (yellow/green/blue/pink), rects (page fractions, ≤ 50), location.
- Reader security (P4): the file is only reachable through a 5-minute signed URL minted by `/library/<book>/read/`
  after `has_entitlement` (S3 pre-signed in prod; locally a signed token re-checked for expiry, file version, active
  flag and entitlement). Staff can preview any book (`READER_STAFF_PREVIEW`). Watermark (masked phone + Jalali date)
  is drawn into every rendered page; print and context menu are blocked.
- **BackInStockRequest** (P2): phone/user + variant, status, notified_at, converted_order (for out-of-stock recovery metric).
- **Review** (P3, moderated; `apps.reviews`), **WishlistItem** (P3; `apps.wishlist`). Kept out of `engagement`
  so Phase 2 and 3 migrations never collide.
- **Redirect** (P5): old_path (unique) → new_path, status 301, hit count.
- **Review** (P3, moderated), **Wishlist** (P3).
- **Redirect** (P5, `apps.seo`): old_path (unique, decoded) + `old_path_key` (`redirect_key`: decoded, ي/ك fixed, lowercase ASCII, no trailing slash) → new_path (internal path or https URL), status 301/302, is_active, hit_count, last_hit_at, note, source (SEED/ADMIN/IMPORT/NOT_FOUND). No chains or loops.
- **NotFoundHit** (P5): 404 paths reported by the storefront with hit counts, so missed Sazito URLs become redirects from the admin.

## 4. API (`/api/v1/`)

Phase 1 (read-only, public, cached):

| Method & path | Purpose |
|---|---|
| `GET /catalog/home/` | One call for the homepage: next exam, exam types, subjects, categories (top level), hero/course banners, bestsellers, سریع‌خوان rail, featured course, guide videos |
| `GET /catalog/books/` | List. Filters: `subject`, `exam_type`, `category` (includes descendants), `format` (print/ebook/bundle), `min_price`, `max_price`, `in_stock`, `featured`, `quick_review`, `q` (normalised search); `ordering`: `-sales_count`, `price`, `-price`, `-created_at`, `title`; paginated |
| `GET /catalog/books/<slug>/` | Detail incl. variants, subjects, exam types, authors, publisher, samples, courses, kit placement |
| `GET /catalog/books/<slug>/related/` | "دانشجویان این کتاب‌ها را هم خریدند" (Phase 1: same subjects by sales; Phase 3: co-purchase) |
| `GET /catalog/subjects/` · `/exam-types/` · `/categories/` (tree) · `/categories/<slug>/` | Taxonomies |
| `GET /catalog/exam-events/` | Upcoming exams |
| `GET /catalog/study-kits/?exam_type=&subject=` | Recommended books per subject (powers `/kit` in Phase 2) |
| `GET /health/` | Liveness (DB + Redis) |

Phase 2: `GET/POST/PATCH/DELETE /cart/…`, `POST /cart/items/bulk/` (add whole kit), `POST /back-in-stock/`.
Phase 3 (full contract: `docs/api-contract-phase-3.md`): `POST /auth/otp/request/`, `POST /auth/otp/verify/` (sets httpOnly JWT cookies), `POST /auth/refresh/`,
`POST /auth/logout/`, `GET /me/`, addresses CRUD, `GET /shipping-methods/`, `POST /checkout/quote/`,
`POST /checkout/` → payment URL, `GET /payments/zarinpal/callback/`, orders list/detail, library list,
wishlist, notify-me list. Phase 4 (done, see docs/api-contract.md): `GET /library/<book>/read/` → book, short-lived signed file URL, progress,
watermark; `GET/PUT /library/<book>/progress/`; highlights CRUD under `/library/<book>/highlights/`;
`GET /library/files/<token>/` (local storage only).
Phase 6 (docs/api-contract.md «Phase 6»): `GET /library/<book>/epub/chapters/<n>/`, `GET /library/<book>/epub/search/?q=`,
bookmarks CRUD under `/library/<book>/bookmarks/`, `GET/DELETE /library/devices/`, `GET /library/epub-assets/<token>/`;
every reader call sends `X-Reader-Device`. Phase 6b: `POST /library/<book>/copies/`, `GET /library/<book>/notes/export/?format=md|html`,
`POST /library/<book>/offline/`, `GET/DELETE /library/offline/`.

## 5. Pages (Next.js)

| Route | Phase | Notes |
|---|---|---|
| `/` | 1 | Countdown bar, header (search, login, cart), category nav, hero, exam chips, subject tiles, bestsellers, سریع‌خوان rail with "خبرم کن", book + course banner, guide videos, trust row, footer |
| `/product/<slug>` | 1 | Cover, sample pages, intro video, meta, subject/exam tags, format switcher, course add-on, tabs (description / TOC / study plan), related rail, JSON-LD Book+Product+Offer, generateMetadata |
| `/category/<slug>`, `/search?q=` | 2 | Filters + sorting, SSR |
| `/kit` | 2 | Study-kit builder |
| `/cart` | 2 | |
| `/login` | 3 | Phone + OTP |
| `/account`, `/account/{orders,orders/<number>,addresses,library,wishlist,reviews}` | 3 | Dashboard, order timeline + retry payment, ebook library (→ `/read/<slug>` in P4); a «خبرم کن» list is not built yet |
| `/checkout`, `/checkout/result` | 3 | 3 steps: ورود → ارسال (skipped for ebook-only) → پرداخت; result page with retry |
| `/read/<book>` | 4 | ✅ pdf.js reader: page view, zoom, jump, swipe/keys (RTL), resume, highlights + notes drawer, watermark |
| `sitemap.xml`, `robots.txt` | 5 | |
| `/account/{orders,addresses,library,wishlist,notify}` | 3 | |
| `/read/<book>` | 4 | Reader |
| `sitemap.xml`, `robots.txt` | 5 | ✅ sitemap from `/seo/sitemap/`; robots blocks everything unless `NEXT_PUBLIC_SITE_ENV=production` |

## 6. Analytics events (Phase 5 ✅)

`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `kit_built`, `notify_me_requested`,
`course_cross_sell_click` (+ `study_plan_requested`). Typed helpers in `frontend/src/lib/analytics.ts`
(`trackAddToCart`, `trackBeginCheckout`, `trackPurchase`, `trackKitBuilt`, …) send to self-hosted Umami
(queued until the script loads; personal data stripped). Server side: `apps.core.analytics.track_server_event`
(Celery → Umami `/api/send`) for the authoritative `purchase`. Full list, params and owners: `docs/analytics.md`.

## 6b. SEO and redirects (Phase 5 ✅)

- Next.js `middleware.ts` looks every request up in the cached redirect map (`GET /seo/redirects/`) and answers
  301/302; the 404 page reports misses to `POST /seo/not-found/` (admin «سئو › صفحه‌های پیدانشده»).
- Default Sazito redirects are seeded by `seed_redirects` (runs inside `seed_catalog`); the full old URL list is
  imported as CSV in the admin before the DNS switch. Product and category slugs are kept, so most old URLs
  need no redirect at all.
- `lib/seo.ts` holds `NOINDEX` / `searchRobots()` for cart, checkout, account, login, reader and search pages.
- Production stack: `docker-compose.prod.yml` + Caddy (TLS, www→apex, caching headers) + Umami; guide in `docs/deploy.md`.

## 7. Decisions and open questions

Decided by the owner on 2026-10-02 (accepted the recommendations):
- Book cards show the **print price** (`card_price`); other formats appear on the product page.
- «قوانین خاص» colour is `#3F6B6B`.
- Analytics: **self-hosted Umami** (Phase 5), no Google Analytics.

Still open:
1. Production hosting (ArvanCloud cloud server + object storage assumed; any Ubuntu VPS works, see `docs/deploy.md`), domain DNS access, ArvanCloud CDN or not.
2. Real ebook prices (currently placeholders flagged `price_is_placeholder`).

### Phase 3 decisions (2026-10-03)

- Auth: phone OTP (5 digits, 2 min, 5 tries, 60 s resend, 5/hour per phone), only an HMAC of the code is
  stored. httpOnly JWT cookies: `dr_access` 15 min, `dr_refresh` 30 days (rotated, revoked on logout),
  `SameSite=Lax`. The storefront calls the API same-origin through a Next.js rewrite (`/api/v1/*`), so the
  cookies are first-party; JSON-only parsing + Origin check close the CSRF gap.
- Checkout re-prices everything server-side from an explicit item list (from the Phase 2 cart or a
  quick-buy link `/checkout?variant=<id>`); `checkout_key` makes double clicks create one order.
- Payments: `PaymentGateway` interface, ZarinPal v4 in sandbox by default, a `fake` gateway for offline dev.
  The callback verifies with our stored amount under a row lock; a repeated callback never re-verifies,
  never double-grants. Every payment state change writes a `PaymentLog`. A cancelled/declined attempt
  keeps the order payable (retry from the result page or the order page); unpaid orders are cancelled after
  `ORDER_PAYMENT_TIMEOUT_MINUTES` (Celery beat, every 5 min). A late successful payment on a cancelled
  order is still honoured; a second successful payment on a paid order is flagged for refund.
- Marking paid (one transaction): stock decrement (a shortfall is noted for staff, never blocks a paid
  order), discount redemption, ebook entitlements, `sales_count`, then SMS + `order_paid` signal (cart
  lines cleared, back-in-stock requests marked converted).
- Shared book + course cart: not built; it needs dadrose.com academy integration (owner decision).

