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
cd backend  && ruff check . && ruff format --check . && pytest      # 183 tests
cd frontend && npm run lint && npm run typecheck && npm test         # 23 tests
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
