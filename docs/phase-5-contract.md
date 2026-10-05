# Phase 5 contract — SEO, Sazito 301s, analytics, deployment

Shared by the backend and frontend work in Phase 5. Both sides must match this file.

## 1. Redirects (`apps.seo`)

### Models

**Redirect** — `old_path` (CharField 500, unique, stored URL-decoded, starts with `/`),
`old_path_key` (CharField 500, unique, db_index; `redirect_key(old_path)`, set on save),
`new_path` (CharField 500: an internal path starting with `/` **or** an absolute `https://` URL),
`status_code` (301 default, choices 301/302), `is_active` (bool, default true),
`hit_count` (PositiveInteger, default 0), `last_hit_at` (null), `note` (text, blank),
`source` (choices `SEED` «پیش‌فرض سازیتو», `ADMIN` «دستی», `IMPORT` «درون‌ریزی CSV», `NOT_FOUND` «از گزارش ۴۰۴»), timestamps.
Validation: `new_path` must not equal `old_path` and must not be the `old_path` of another active
redirect (no chains/loops); internal paths must start with `/`.

**NotFoundHit** — `path` (CharField 500, unique, decoded), `path_key` (unique), `hits`, `first_seen`,
`last_seen`, `last_referer` (CharField 500, blank), `resolved` (bool). Admin lists by `-hits`
so the store team can turn missed old Sazito URLs into redirects (admin action
«ساخت ریدایرکت به …» is optional; a "create redirect" link prefilled with `old_path` is enough).

### `redirect_key(path)` (pure, tested; Python and TypeScript copies must agree)

1. Drop query string and fragment.
2. URL-decode (`%D8%…` → Persian), repeatedly until stable (max 3).
3. `normalize_persian` letter fixes only: ي→ی، ى→ی، ك→ک (keep ZWNJ/spaces/digits as is, then
   replace spaces and ZWNJ with `-`).
4. Lowercase ASCII, collapse repeated `/`, strip trailing `/` (except root `/`).

### API (public, cached)

| Method & path | Response |
|---|---|
| `GET /api/v1/seo/redirects/` | `{"version": "<hash>", "redirects": {"<old_path_key>": ["<new_path>", 301], …}}` active only. Cached (Redis, 300 s, busted on save/delete). |
| `POST /api/v1/seo/redirects/hit/` | body `{"path": "/product/…"}` → 204. Increments `hit_count`/`last_hit_at` of the matching redirect (by key). Throttled (scope `seo_beacon`, 120/min per IP). Unknown path → 204, no-op. |
| `POST /api/v1/seo/not-found/` | body `{"path": "/x", "referer": "…"}` → 204. Upserts `NotFoundHit` (hits += 1). Ignores paths starting with `/_next`, `/api`, `/static`, `/media`, `/admin`, and paths longer than 500. Throttled (`seo_beacon`). |
| `GET /api/v1/seo/sitemap/` | see below. Cached 300 s. |

```jsonc
// GET /api/v1/seo/sitemap/
{
  "books": [{ "slug": "…", "updated_at": "2026-10-02T12:00:00Z", "cover": "https://…" | null }],
  "categories": [{ "slug": "…", "updated_at": "…" }],   // active only
  "subjects": [{ "slug": "…", "updated_at": "…" }],     // active only
  "exam_types": [{ "slug": "…", "updated_at": "…" }]    // active only
}
```
Only `is_active` books with at least one active variant.

### Seeded redirects (`seed_redirects` management command, idempotent, also run by `seed_catalog`)

- Every old product URL in `seed_catalogue.json` whose new slug differs from the old one
  (today: none; the catalogue keeps old slugs) → `/product/<new>`.
- Every old category path in `seed_old_categories.json` whose slug is not an active category →
  a sensible target (`دوره-های-آموزشی` → `https://dadrose.com/`, unknown → `/`).
- Standard Sazito store paths (assumed, `note` says so): `/products` → `/search`,
  `/search` stays, `/blog` → `https://dadrose.com/blog/`, `/page/about-us` and `/page/contact-us`
  → `/` (until the pages exist), `/login` and `/register` → `/login`, `/profile` → `/account`.
  Admin can edit/deactivate any of these.
- CSV import in the admin (`old_path,new_path[,status]`) for the full list the owner exports from
  Sazito / Google Search Console.

## 2. Frontend redirects

`src/middleware.ts` (matcher excludes `_next`, `api`, `static`, `media`, files with an extension
except `.html`/`.php`): computes `redirectKey(pathname)`, looks it up in the redirect map fetched from
`${API_INTERNAL_URL}/seo/redirects/` (module-level cache, 300 s TTL, stale-while-error), and returns
`NextResponse.redirect(target, status)` preserving the query string for internal targets. On a hit
it fires the hit beacon without awaiting (`event.waitUntil`). It must never throw: API down → no
redirect. Trailing-slash variants of real pages are handled by Next itself.

`not-found.tsx` renders a tiny client component that POSTs `{path, referer}` to
`${NEXT_PUBLIC_API_URL}/seo/not-found/` once (navigator.sendBeacon, fallback fetch keepalive).

## 3. Analytics (self-hosted Umami)

Env (frontend): `NEXT_PUBLIC_UMAMI_SRC` (e.g. `https://stats.dadrosebook.com/script.js`),
`NEXT_PUBLIC_UMAMI_WEBSITE_ID`. Both empty → no script, `track()` still dispatches the DOM event.
Script loaded with `next/script` `strategy="afterInteractive"`, `data-website-id`,
`data-domains=<site host>`, `data-do-not-track` not set (Iranian audience; no consent banner required
by law, but no personal data is sent).

`src/lib/analytics.ts` keeps `track(event, params)` and adds typed helpers other phases call:

```ts
trackViewItem(item: AnalyticsItem)
trackAddToCart(item: AnalyticsItem & { quantity: number; source?: "product" | "card" | "kit" | "sticky" })
trackBeginCheckout(cart: { value: number; items: number; formats: VariantType[] })
trackPurchase(order: { order_number: string; value: number; items: number; formats: VariantType[]; has_bundle: boolean; discount_code?: string })
trackKitBuilt(kit: { exam_type: string; subjects: number; books: number; value: number })
trackNotifyMeRequested(item: { item_id: number; item_name: string; variant: VariantType })
trackCourseCrossSellClick(c: { course_id: number | string; course_title: string; book_slug?: string; placement: string })
// AnalyticsItem = { item_id: number; item_name: string; variant?: VariantType; price?: number | null; subject?: string; exam_type?: string }
```
Money values are integer toman (`currency: "TOMAN"` is added automatically). Before the Umami
script loads, events are queued (max 50) and flushed when `window.umami` appears. No phone numbers,
names or addresses are ever sent.

Backend: `apps.core.analytics.track_server_event(name, data, *, url="/", request=None)` sends an
event to Umami's `/api/send` (env `UMAMI_HOST`, `UMAMI_WEBSITE_ID`; empty → no-op) through a Celery
task with a 3 s timeout, never raising. Phase 3 calls it for `purchase` when an order becomes PAID
(the authoritative purchase count; the client `trackPurchase` on the result page is a duplicate-safe
complement keyed by `order_number`).

## 4. SEO metadata rules

- Every indexable page sets `alternates.canonical` (absolute via `metadataBase`).
- Non-indexable: `/search` with filters other than `q`… → `robots: {index: false, follow: true}`;
  `/cart`, `/checkout/*`, `/account/*`, `/login`, `/read/*`, `/plan/*` → `noindex, nofollow`.
- Home: `Organization` (+ logo, sameAs Instagram/Telegram/dadrose.com) and `WebSite` with
  `SearchAction` (`/search?q={search_term_string}`) JSON-LD.
- `robots.txt`: in production (`NEXT_PUBLIC_SITE_ENV=production`) allow `/`, disallow `/cart`,
  `/checkout`, `/account`, `/login`, `/read`, `/plan`, `/api/`; elsewhere `Disallow: /`.
  `Sitemap: <site>/sitemap.xml`.
- `sitemap.xml`: `/`, `/kit`, every book, category; `lastModified` from the API; product entries
  carry the cover in `images`. Revalidate hourly; API down → home only (never a 500).
