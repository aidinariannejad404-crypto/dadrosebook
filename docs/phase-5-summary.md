# Phase 5 summary — SEO, Sazito 301s, analytics, production readiness

## How to run

Development is unchanged: `cp .env.example .env && docker compose up --build`.
`seed_catalog` now also runs `seed_redirects`.

Production (not deployed yet, waiting for the hosting decision):
`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`. The full guide, in Persian, is in
`docs/deploy.md`.

Checks (all passing):

```bash
cd backend  && ruff check . && ruff format --check . && pytest      # 502 tests (117 new)
cd frontend && npm run lint && npm run typecheck && npm test         # 170 tests
USE_API_FIXTURES=1 npm run build                                     # builds without a backend
```

CI runs the same checks in `.github/workflows/ci.yml`. It also runs `makemigrations --check`,
`check --deploy`, shellcheck and a compose config check. It does not deploy.

## What was built

**Redirects (Sazito → new store).**
- New `apps.seo` with two models:
  - `Redirect`: old path → new path or https URL, 301/302, hit counter.
  - `NotFoundHit`: 404 paths with hit counts.
- `redirect_key` normalises paths the same way in Python and TypeScript, with mirrored tests. It decodes
  `%D8…`, maps ي/ى→ی and ك→ک, lowercases ASCII, collapses `//` and drops the trailing slash.
- The Next.js middleware serves the redirects from a map it caches for 5 minutes. When the API is down it
  keeps using the stale map, and it never fails the request.
- Admin, under «سئو»:
  - redirects list
  - CSV import (`old_path,new_path[,status]`)
  - a 404 report sorted by hits, with "create redirect" prefilled
- Product and category slugs were already kept from Sazito, so most old URLs work without a redirect.
  Seven defaults are seeded, such as `/products` → `/search` and the old courses category → dadrose.com.
  The standard Sazito paths are assumptions and are labelled that way in the admin.
- Verified against the real backend:
  - `/products?q=x` → 301 to `/search?q=x`
  - the encoded Persian old category → 301 to dadrose.com
  - an unknown URL → 404, logged in the admin

**SEO.**
- `sitemap.xml`: home, `/kit`, every active book with its cover, and every category. It revalidates
  hourly; if the API is down it lists the home page only.
- `robots.txt`: blocks everything unless `NEXT_PUBLIC_SITE_ENV=production`, so staging is never indexed.
- Pages:
  - Home: canonical URL plus Organization and WebSite JSON-LD with SearchAction.
  - Product: offers carry a seller, and `gtin13` comes from 13-digit ISBNs.
  - `twitter:card` is set on every page.
  - The 404 page and plan pages are noindex.
- `lib/seo.ts` gives later phases `NOINDEX` and `searchRobots()`.

**Analytics (self-hosted Umami).**
- Client side: `lib/analytics.ts` has typed helpers for all seven events:
  - Events fired before the Umami script loads are queued.
  - Phone numbers, names and addresses are stripped.
  - `purchase` is de-duplicated by order number.
- Server side: `track_server_event` sends events through Celery to Umami `/api/send`.
- `docs/analytics.md` lists every event, its parameters and which phase calls it.

**Performance.** Lighthouse mobile, median of three runs on a production build:

| Page | Before | After | LCP (sim.) | CLS | TBT |
|---|---|---|---|---|---|
| Home | 91 | **96** | 2.6 s | 0 | 124 ms |
| Product | 95 | **97** | 2.5 s | 0 | 65 ms |

Changes:
- Vazirmatn subset to the Persian, Arabic and Latin glyphs we use: 111 KB → 69 KB. Regenerate with
  `frontend/scripts/subset-font.sh`.
- CSS inlined into the HTML (`experimental.inlineCss`).
- Caddy serves hashed assets with immutable caching and zstd/gzip compression.

**Production deployment config.**
- `docker-compose.prod.yml` runs Postgres, Redis (password, AOF), gunicorn, the Celery worker, the Next.js
  standalone frontend, Umami and Caddy. Caddy handles automatic TLS, the www→apex 301, security headers and
  `/media` from a read-only volume. Private ebook files are never mounted in Caddy.
- `prod.py` refuses a weak `SECRET_KEY` and logs as JSON.
- `deploy/backup.sh` backs up both databases and media, with optional S3/rclone upload. Restore was tested.
- `deploy/smoke.sh` checks the site after a deploy.
- The whole prod stack was started locally and passed the smoke test. Umami was a stub there, because its
  image can't be pulled in this sandbox.

## Skipped / for later phases

- The cart, checkout and kit pages are built in phases 2 and 3. Their `add_to_cart`, `begin_checkout`,
  `purchase` and `kit_built` calls, and the noindex on their pages, belong there. The helpers are ready and
  documented.
- `/category/*` and `/kit` are in the sitemap but return 404 until phase 2 lands.
- There is no Open Graph share image or raster logo yet; JSON-LD uses `/icon.svg`. A 1200×630 PNG is needed.
- The real Lighthouse targets, measured on a phone over Iranian 4G, can only be checked after deployment.
  The simulated home LCP of 2.6 s is close to the 2.5 s target. The next lever would be fewer 3D book DOM
  nodes per card on the home rails.
- The Umami image tag is `latest`; pin it after the first pull.

## Decisions needed from the owner

1. **Hosting**: ArvanCloud cloud server (assumed) or another Ubuntu VPS with 2 vCPU / 4 GB. Also DNS access
   for `dadrosebook.com`, `www` and `stats`.
2. **Old URL list**: an export of every URL from Sazito or Google Search Console, so it can be imported as
   CSV before the DNS switch.
3. **Object storage** (Arvan S3) or the server disk for covers and ebooks, and whether to put the ArvanCloud
   CDN in front.
4. **Social profile URLs** (Instagram, Telegram) for the Organization JSON-LD. Fill `SOCIAL_PROFILES` in
   `frontend/src/lib/config.ts`.
