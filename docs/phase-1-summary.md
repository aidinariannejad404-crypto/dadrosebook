# Phase 1 summary — فروشگاه کتاب دادرُز

## How to run

```bash
cp .env.example .env
docker compose up --build
```

- Storefront: http://localhost:3000
- API: http://localhost:8000/api/v1/catalog/home/
- Admin: http://localhost:8000/admin/ — dev superuser `09120000000` / `admin` (created only when `DEBUG=true`)

On first start the backend migrates and runs `seed_catalog` (idempotent, safe on every restart).

Checks (all passing):

```bash
cd backend  && ruff check . && ruff format --check . && pytest      # ~280 tests
cd frontend && npm run lint && npm run typecheck && npm test         # 52 tests
```

## What was built

**Infrastructure.** Monorepo with `docker-compose.yml` (Postgres 16, Redis 7, Django backend, Celery worker,
Next.js frontend). Settings split `base/dev/prod/test`, everything configured from `.env`. Storage switch: local disk in dev,
ArvanCloud S3 public + private buckets in prod (`USE_S3=true`). Verified with a full `docker compose up`: all five
services healthy, homepage and product page 200, unknown product 404, admin RTL, worker ready.

**Backend.**
- Persian normalisation (`apps/core/normalize.py`): ي/ک unification, ZWNJ handling, diacritics, digits; unicode Persian slugs,
  toman formatting, Jalali helpers and a Jalali date input for the admin. All tested.
- Phone-based custom user model (created now because swapping it later is painful) and the `SmsProvider` interface with a console provider.
- Catalog models: ExamType, Subject (colour), Category tree, Person, Publisher, Book, BookSamplePage, BookVariant
  (PRINT / EBOOK / BUNDLE), RelatedCourse, ExamEvent, StudyKitRecommendation + ordered items; Banner and GuideVideo for the homepage.
- Admin (django-unfold) fully Persian and RTL with Vazirmatn: book screen with variant and sample-page inlines, colour swatches,
  toman prices, stock state, placeholder-price filter, ordered study-kit editor, Jalali exam dates.
- Read-only API per `docs/api-contract.md`: home aggregate (cached 60s), book list with filters/sorting/normalised search,
  detail, related books, subjects, exam types, category tree, exam events, study kits, health.
- `seed_catalog` with the real titles and prices, the four out-of-stock سریع‌خوان books, the Dadrose course, both 1405 exams
  (کانون: 1405/08/14 = 2026-11-05, مرکز: 1405/09/20 = 2026-12-11), study kits, banners and guide videos.

**Frontend.** Next.js 15 App Router, RTL, self-hosted Vazirmatn, brand tokens in one file (`src/styles/tokens.css`).
- Homepage: exam countdown, header with search, category nav, hero, exam chips, subject-colour tiles, bestsellers, سریع‌خوان rail
  with notify-me, book + course banner, guide videos, trust row, footer.
- Product page: generated subject-colour cover (until real scans exist), sample-page viewer, click-to-load intro video,
  format switcher (price, discount and delivery note per format), course add-on with UTM link, tabs, related books,
  mobile sticky buy bar, metadata, canonical URL and JSON-LD (Book + Product + Offer).
- Lighthouse mobile (measured on the fixture build): home 96 / 100 / 100 / 100, product 97 / 100 / 100 / 100; no horizontal scroll at 360px.
- Analytics `track()` stub already fires `view_item`, `notify_me_requested`, `course_cross_sell_click`.

Screenshots against the real API: `docs/screenshots/`.

## Additions after the first review (2026-10-02)

- **Real catalogue.** All 78 books from dadrosebook.com (42 in stock, 36 out of stock) with their own descriptions,
  specs and the **same URLs** (`/product/<old slug>`, `/category/<old slug>`), so SEO carries over. Data:
  `backend/apps/catalog/seed_catalogue.json`. `seed_catalog --if-empty` runs on start and never overwrites admin edits.
- **Prices.** dadrosebook's live prices are kept; six books that were cheaper than the publisher's current price
  (Chatr Danesh store) were raised to it, with the source in the variant's «منبع قیمت» note (admin).
- **Covers.** `python manage.py fetch_covers` downloads each book's cover from the old store's image host. It could not
  run in the build sandbox (host blocked) but runs automatically on `docker compose up` on a machine that can reach
  oss.sazito.com. Until then books show the generated subject-colour cover.
- **3D books.** Every cover (real or generated) is shown as a CSS-only 3D book: spine, page block, two-volume sets,
  pointer tilt on the product page. Lighthouse mobile stays 95–98.
- **Competitor research** (`docs/research/competitor-analysis.md`) and its 18 Phase 1 quick wins, built on backend and
  storefront: edition badge, exam-fit table, persistent «آزمون من», sample buttons above the fold, kit role,
  countdown and delivery promise on the product page, bundle saving, sold-out fallbacks, subject weights, consult
  links, resource types, honest social proof, SEO titles, admin completeness score, store settings page.
- **Decisions applied:** print price on cards, `#3F6B6B` for «قوانین خاص», Umami for analytics (Phase 5).

## Academy courses on book pages (2026-10-02)

- **Course catalogue.** All 53 open courses on dadrose.com (78 rows incl. archived) are in the admin with type
  (جامع / امهات / نکته و تست / …), subject, teacher, hours, price and students; 278 book↔course links ranked
  «based on this book» > «taught by the author» > «same subject». Analysis: `docs/research/dadrose-courses-analysis.md`.
- **Cross-sell section on every book page:** author/referenced course first, good-better-best tiers with the tier
  that fits the days left to the exam marked «پیشنهاد ما», price per hour, honest student counts, free first-session
  video, other courses of the subject, and a per-subject discount code (admin «کد تخفیف دوره»; none seeded until the
  academy creates real codes). Purchase links out to dadrose.com with UTM tracking; shared cart planned for Phase 3.
- **Study-plan lead magnet:** a mobile number + exam + subjects gives a day-by-day plan to the exam with review days
  and matching courses, printable / save as PDF. Leads are listed and exportable (CSV) in the admin.

## Skipped / deferred on purpose

- Add to cart and "notify me" are visible but say the feature is coming (cart and back-in-stock requests are Phase 2).
- Search, category, kit, login and cart pages are linked but not built (Phases 2–3).
- No real cover images, publishers or ISBNs in the seed; ebook and bundle prices and سریع‌خوان prices are placeholders,
  flagged with `price_is_placeholder` (filter in admin under «نسخه‌ها»).
- eNamad badge and footer contact details are placeholders.

## Decisions for you

1. **Card price.** Book cards show «از …» with the cheapest format, which is currently the placeholder ebook price. Keep, or show the print price on cards?
2. **Colour for «قوانین خاص»** — the brief gave none; I used `#3F6B6B`.
3. **Analytics tool** for Phase 5 (self-hosted Umami/Matomo vs. Google Analytics).
4. **Real data**: publishers, ISBNs, cover scans and ebook prices when available (all editable in the admin).
5. **Unfold admin RTL**: unfold's CSS is left-to-right internally; a generated `unfold-rtl.css` mirrors it
   (`python manage.py build_admin_rtl_css` after upgrading unfold). The date-picker popup still opens on the left.

## Next (Phase 2)

Category and search page with filters, study-kit builder (`/kit`), guest cart with merge on login, back-in-stock requests.
