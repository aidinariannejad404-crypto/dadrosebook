# PLAN — فروشگاه کتاب دادرُز (Dadrose Book)

Online store for Iranian law students and bar-exam candidates: print books, ebooks and
print + ebook bundles, organised around exams (کانون وکلا، مرکز وکلا، قضاوت، سردفتری، ارشد و دکتری).
It replaces the current Sazito store at dadrosebook.com.

Status legend: ✅ done · 🚧 in progress · ⏳ planned

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold, docker-compose, Django settings split, unfold admin (fa/RTL), catalog models + admin, read-only catalog API, Persian normalisation, seed data, Next.js RTL shell, homepage, product page | ✅ |
| 2 | Category/search page, study-kit builder, cart (guest + merge), back-in-stock requests | ⏳ |
| 3 | OTP auth, checkout, shipping, discount codes, ZarinPal, orders, account pages, ebook entitlements | ⏳ |
| 4 | Secure ebook reader, reading progress, highlights | ⏳ |
| 5 | SEO hardening, Sazito 301s, performance, analytics events, production deployment | ⏳ |

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
│       ├── library/    (P3/4)  # EbookFile, EbookEntitlement, ReadingProgress, Highlight
│       ├── engagement/ (P2/3)  # BackInStockRequest, Review, Wishlist
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
- **ReadingProgress, Highlight** (P4).
- **BackInStockRequest** (P2): phone/user + variant, status, notified_at, converted_order (for out-of-stock recovery metric).
- **Review** (P3, moderated), **Wishlist** (P3).
- **Redirect** (P5): old_path (unique) → new_path, status 301, hit count.

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
Phase 3: `POST /auth/otp/request/`, `POST /auth/otp/verify/` (sets httpOnly JWT cookies), `POST /auth/refresh/`,
`POST /auth/logout/`, `GET /me/`, addresses CRUD, `GET /shipping-methods/`, `POST /checkout/quote/`,
`POST /checkout/` → payment URL, `GET /payments/zarinpal/callback/`, orders list/detail, library list,
wishlist, notify-me list. Phase 4: `GET /library/<book>/read/` → short-lived signed page/file URLs,
progress & highlights CRUD.

## 5. Pages (Next.js)

| Route | Phase | Notes |
|---|---|---|
| `/` | 1 | Countdown bar, header (search, login, cart), category nav, hero, exam chips, subject tiles, bestsellers, سریع‌خوان rail with "خبرم کن", book + course banner, guide videos, trust row, footer |
| `/product/<slug>` | 1 | Cover, sample pages, intro video, meta, subject/exam tags, format switcher, course add-on, tabs (description / TOC / study plan), related rail, JSON-LD Book+Product+Offer, generateMetadata |
| `/category/<slug>`, `/search?q=` | 2 | Filters + sorting, SSR |
| `/kit` | 2 | Study-kit builder |
| `/cart`, `/checkout`, `/checkout/result` | 2–3 | |
| `/login` | 3 | Phone + OTP |
| `/account/{orders,addresses,library,wishlist,notify}` | 3 | |
| `/read/<book>` | 4 | Reader |
| `sitemap.xml`, `robots.txt` | 5 | |

## 6. Analytics events (Phase 5, names fixed now)

`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `kit_built`, `notify_me_requested`,
`course_cross_sell_click`. A thin `track()` wrapper in `frontend/src/lib/analytics.ts` will dispatch to a
self-hosted Umami instance (decided). Course links already carry UTM params.

## 7. Decisions and open questions

Decided by the owner on 2026-10-02 (accepted the recommendations):
- Book cards show the **print price** (`card_price`); other formats appear on the product page.
- «قوانین خاص» colour is `#3F6B6B`.
- Analytics: **self-hosted Umami** (Phase 5), no Google Analytics.

Still open:
1. Production hosting (ArvanCloud cloud server + object storage assumed).
2. Real ebook prices (currently placeholders flagged `price_is_placeholder`).
