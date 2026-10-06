# Growth loops (research package «و»: و۱ و۳ و۴ و۵ و۶)

Backend app `apps.growth` (models, services, admin, API under `/api/v1/growth/`); storefront pieces in
`frontend/src/lib/growth.ts` and `frontend/src/components/growth/`. Small hooks in shared code are marked
`growth (و…)` (orders quote/checkout/state, checkout serializer, library `EbookEntitlement.Source.GIFT`).

## و۱ Torob and Emalls
- `POST /torob_api/v3/products` on the storefront host (Next.js rewrite → `/api/v1/growth/torob/v3/products/`).
  Body `page` (100 per page) or `page_urls[]` / `page_uniques[]`. Response `api_version`, `current_page`,
  `max_pages`, `products[]` with `page_unique` (= variant id; one row per sellable variant), `page_url`, `title`,
  `subtitle`, `current_price`, `old_price` (only when discounted), `availability` (`instock`/`outofstock`),
  `image_links`, `category_name`, `spec`, `guarantee`. Placeholder-priced or inactive variants are not listed,
  but an explicit `page_uniques` lookup returns them as `outofstock`.
- `X-Torob-Token`: EdDSA JWT verified against `TOROB_PUBLIC_KEY` (PEM/base64/hex). `exp` required, `nbf`
  and `aud` (`TOROB_JWT_AUDIENCE`) checked. The project has no `cryptography` package, so Ed25519 is verified
  by a tested pure-Python RFC 8032 implementation (`services/ed25519.py`; uses `cryptography` if installed).
  No key: 403 in production, open when `DEBUG`.
- Prices are toman; `TOROB_PRICE_UNIT=rial` (and `NEXT_PUBLIC_TOROB_PRICE_UNIT` for the meta tags) multiplies by 10.
- Product pages carry `<meta name="product_id|product_name|product_price|product_old_price|availability|guarantee">`
  (print variant first).
- Emalls: `/feeds/emalls.json` and `/feeds/emalls.xml` (cached 15 min).
- **Owner must confirm in the Torob seller panel** (docs were unreachable from the build sandbox; the
  shape comes from third-party integrations): field names, price unit, token claims/audience, whether
  several variants may share one `page_url`. Same for the Emalls field names.

## و۳ Shareable kit link
- «ارسال به گروه مطالعه» box in the kit builder: creates `KitShare` (8-char token, deduplicated) →
  `/kit?k=<token>`; fallback `/kit?exam=…&b=slug1,slug2`. Telegram/WhatsApp intents + copy.
- The recipient sees the kit with the sharer's formats preselected and «افزودن همه به سبد».
- Shared variants are `noindex, follow` with canonical `/kit`; OG image `/kit/share-image?…` draws the covers.

## و۴ Gift by link
- Checkout «این خرید هدیه است» (shipping step for print, payment step for ebook-only): sender, recipient
  name, message (≤300). Print gifts choose a shipping method but no address.
- On payment the buyer gets no entitlement; the gift becomes active for `GIFT_CLAIM_DAYS` (90). The result
  page and order page show the one-time link, share buttons and a printable card (`/gift/<token>/card`).
- `/gift/<token>`: recipient logs in with phone OTP; print items need their address (written onto the order,
  staff note updated); ebooks become entitlements with source `GIFT`. Claim is idempotent (same user replay
  → same result; another user → 409; expired → 410). Refunds still revoke via `revoke_for_order`.
- Staff: paid print gifts carry the note «تا ثبت نشانی توسط گیرنده ارسال نشود».
- Not built: SMS to the recipient, automatic refund of expired gifts (staff handle them from «هدیه‌ها»).

## و۵ Partner codes
- `Partner` (name, kind: انجمن دانشجویی / مؤسسه / آکادمی / سایر) + `PartnerCode` (one `DiscountCode` → partner).
- Admin «همکاران»: per partner paid orders, customers, revenue, net revenue (after refunds), discount given;
  window filter 30/90/365 days (`services/partners.partner_report`).

## و۶ Exam-calendar campaigns
- `Campaign` (title, slug, subtitle, description, hero image/colour, start/end, optional `ExamEvent`, books,
  subjects, one `DiscountCode` as the rule, home banner flag).
- `/campaign/<slug>`: hero, live countdown, discount badge, eligible books; ended campaigns are noindex.
- During the window the quote applies the best of the entered code and the campaign discount automatically
  (scoped to the campaign's books/subjects); typing the campaign's own code is rejected. The cart shows the
  auto discount; the order stores it as a normal code (redemptions/limits work).
- Home: `CampaignBanner` under the hero for running campaigns with «بنر صفحه اصلی».

## Analytics
`kit_shared`, `shared_kit_added`, `gift_link_shared`, `gift_claimed`, `campaign_viewed` (typed helpers in `analytics.ts`).
