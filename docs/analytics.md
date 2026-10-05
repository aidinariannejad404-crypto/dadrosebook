# Analytics events

Self-hosted [Umami](https://umami.is) (Phase 5, `docs/phase-5-contract.md` §3). No personal data is
ever sent: no phone numbers, names, addresses or emails.

## How it works

- **Script**: `src/components/analytics/Umami.tsx`, mounted in the root layout. It loads only when both
  `NEXT_PUBLIC_UMAMI_SRC` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are set (build-time values), with
  `next/script` `afterInteractive`, `data-website-id` and `data-domains=<host of NEXT_PUBLIC_SITE_URL>`.
  `data-do-not-track` is not set. Umami records pageviews on its own.
- **Client events**: `src/lib/analytics.ts`. Every call:
  1. dispatches a `dadrose:analytics` `CustomEvent` on `window` (`detail: { event, params }`),
  2. pushes `{ event, ...params }` to `window.dataLayer` if one exists,
  3. sends `umami.track(event, params)`. Until the script has loaded, events wait in a queue (at most
     50, oldest dropped). The queue is flushed by the script's `onLoad` and by a light poll (every
     500 ms, for at most 60 s).
- **Params are cleaned** before anything is sent: `null`/`undefined` dropped; keys named `name`,
  `first_name`, `last_name`, `full_name` or containing `phone`, `mobile`, `email`, `address` dropped;
  any string value that is an Iranian mobile number dropped; strings capped at 500 chars.
- **Money** is integer toman. `currency: "TOMAN"` is added to every event that has `value` or `price`.
- Lists are flattened for Umami: `formats` is a sorted, de-duplicated comma list (`"EBOOK,PRINT"`).
- **Server events**: `apps.core.analytics.track_server_event(name, data, *, url="/", request=None)`
  (backend, env `UMAMI_HOST` + `UMAMI_WEBSITE_ID`), sent by a Celery task, never raises.

Call sites use the typed helpers, not `track()` directly.

## Events

| Event | Helper | Params | Fires | Call site owner |
|---|---|---|---|---|
| `view_item` | `trackViewItem(item)` | `item_id`, `item_name`, `variant?`, `price?`, `subject?` (slug), `exam_type?` (slug), `currency` | Product page mount | Phase 1 — `components/product/ViewItemTracker.tsx` (done) |
| `add_to_cart` | `trackAddToCart(item)` | item params + `quantity`, `source?` (`product` \| `card` \| `kit` \| `sticky`), `value` (= price × quantity), `currency` | Item added to the cart | **Phase 2–3** cart: buy box, book cards, sticky buy bar, kit page |
| `begin_checkout` | `trackBeginCheckout(cart)` | `value`, `items` (units), `formats`, `currency` | Checkout page opened / «ادامه خرید» from the cart | **Phase 2–3** cart/checkout |
| `purchase` | `trackPurchase(order)` | `order_number`, `value`, `items`, `formats`, `has_bundle`, `discount_code?`, `currency` | Payment result page for a PAID order. Sent once per `order_number` per browser session (sessionStorage key `dadrose:purchase:<order_number>`) | **Phase 3** result page; **backend** sends the authoritative `purchase` with `track_server_event` when the order becomes PAID |
| `kit_built` | `trackKitBuilt(kit)` | `exam_type` (slug), `subjects` (count), `books` (count), `value`, `currency` | Kit added to the cart on `/kit` | **Phase 2** kit page |
| `notify_me_requested` | `trackNotifyMeRequested(item)` | `item_id`, `item_name`, `variant` | «موجود شد خبرم کن» clicked | Existing — `components/ui/NotifyMeButton.tsx` (Phase 2 may move it to the successful registration) |
| `course_cross_sell_click` | `trackCourseCrossSellClick(c)` | `course_id`, `course_title`, `book_slug?`, `placement` (`home`, `highlight`, `more`, `buy_box`, CourseCard `tier`/placement) | Click on a dadrose.com course link | Existing — `components/ui/TrackedLink.tsx` (`course` prop) used by CourseBanner, CourseCrossSell, CourseCard, PurchasePanel |
| `study_plan_requested` | `trackStudyPlanRequested(p)` | `exam_type`, `subjects` (comma list of slugs), `subjects_count`, `hours_per_day`, `book?` (slug) | Study-plan form submitted successfully (the phone number is never sent) | Existing — `components/plan/StudyPlanForm.tsx` |
| `web_vitals` | `trackWebVital(v)` | `metric` (`LCP` \| `INP` \| `CLS` \| `TTFB`), `metric_value` (ms; CLS unitless ×1 with 3 decimals), `rating` (`good` \| `needs-improvement` \| `poor`), `page_type` (`home`, `product`, `category`, `search`, `kit`, `policy`, …), `connection` (`4g`, `3g`, `…-save`, `unknown`), `navigation_type` | Sampled page loads (`NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE`, default 0.2), one event per metric when Next reports it (INP/CLS on page hide). No URL or slug is sent | Package الف۷ — `components/analytics/WebVitals.tsx` (root layout) |

## Adding an event

1. Add the name to `AnalyticsEvent` and a typed helper in `src/lib/analytics.ts` (+ a test in
   `analytics.test.ts`).
2. Add a row above.
3. Never pass personal data; send counts and slugs, not free text typed by the visitor.
