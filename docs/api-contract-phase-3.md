# Phase 3 API contract (`/api/v1/`) — auth, checkout, orders, library, reviews, wishlist

Extends `docs/api-contract.md`. Money is integer **toman** (Rial only inside the gateway adapter).
Dates/times ISO 8601 (UTC). Errors: `400 { "<field>": ["پیام فارسی"], "detail"?: "…" }`,
`401 { "detail": "…" }` when login is required, `404 { "detail": "…" }`.

## Auth model

- Login is phone + OTP only; there are no passwords for customers. A new phone creates a user.
- `POST /auth/otp/verify/` sets two **httpOnly** cookies: `dr_access` (15 min, path `/`) and
  `dr_refresh` (30 days, path `/api/v1/auth/`), `SameSite=Lax`, `Secure` in production.
- The storefront calls the API **same-origin** through a Next.js rewrite (`/api/v1/*` → backend), so
  the cookies are first-party and server components can forward them. Browser calls use
  `credentials: "include"` and `Content-Type: application/json`.
- When a protected endpoint answers `401`, the client calls `POST /auth/refresh/` once and retries;
  if refresh also answers `401`, the user is logged out.
- Login fires Django's `user_logged_in` signal (`sender=User`, `request`, `user`): Phase 2's cart
  merge hooks onto it. A paid order fires `apps.orders.signals.order_paid(sender=Order, order=…)`.

```jsonc
// Me
{ "id": 7, "phone": "09121234567", "first_name": "", "last_name": "", "full_name": "", "is_staff": false,
  "date_joined": "2026-10-02T18:00:00Z" }
```

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/otp/request/` | `{ "phone": "۰۹۱۲…" }` (any Persian/Latin digits, +98) | `200 { "phone": "09121234567", "expires_in": 120, "resend_in": 60, "length": 5 }`. `400 {phone:[…]}` invalid. `429 { "detail": "…", "retry_after": 42 }` when asked again within `resend_in` or over 5/hour per phone (also per-IP throttle). |
| `POST /auth/otp/verify/` | `{ "phone": "…", "code": "۱۲۳۴۵" }` | `200 { "user": Me, "is_new": true }` + cookies. `400 { "code": ["کد واردشده درست نیست."] }`, expired → `400 {code:["کد منقضی شده است…"]}`, 5 wrong tries → code is burned (`400`, must request again). |
| `POST /auth/refresh/` | – (cookie) | `200 { "user": Me }` + rotated cookies; `401` and cookies cleared when missing/invalid. |
| `POST /auth/logout/` | – | `204`, cookies cleared, refresh token revoked. |
| `GET /me/` | – | `200 Me` or `401`. |
| `PATCH /me/` | `{ "first_name", "last_name" }` | `200 Me`. |

## Addresses

```jsonc
// Address
{ "id": 3, "title": "خانه", "recipient_name": "علی رضایی", "recipient_phone": "09121234567",
  "province": "تهران", "city": "تهران", "postal_code": "1234567890", "address_line": "…",
  "is_default": true, "is_tehran": true }
```
- `GET /addresses/` → `[Address]` (default first). `POST /addresses/` → `201 Address`.
  `GET|PATCH|DELETE /addresses/<id>/`. Owner only (others → 404). Postal code: 10 digits (Persian digits
  accepted, normalised). Phone normalised like login. Province must be one of `GET /addresses/provinces/` →
  `["آذربایجان شرقی", …]`. The first address becomes default; setting `is_default` unsets the others.
  Max 10 addresses per user.

## Shipping methods

```jsonc
// ShippingOption
{ "id": 1, "code": "post", "name": "پست پیشتاز", "description": "", "eta_note": "۳ تا ۵ روز کاری",
  "price": 45000,            // after free-shipping rules for the given subtotal (0 = free)
  "base_price": 45000, "is_free": false, "free_over": 1500000, "tehran_only": false }
```
- `GET /shipping-methods/?province=<name>&subtotal=<toman>` → `[ShippingOption]`, active methods, `tehran_only`
  ones only when `province == "تهران"`. Free when `subtotal ≥ free_over` (method value, else
  `StoreSettings.free_shipping_threshold` when > 0).
- Seed: «پست پیشتاز» (post, 45٬000, ۳ تا ۵ روز کاری) and «پیک تهران» (courier, tehran_only, 65٬000,
  «ارسال همان روز / فردا»). Ebook-only carts need no shipping.

## Checkout

Items are sent explicitly (the frontend reads them from the Phase 2 cart, or from a «خرید سریع» link
`/checkout?variant=<id>`); the server re-prices everything from the DB.

```jsonc
// CheckoutRequest
{
  "items": [{ "variant_id": 10, "quantity": 1 }],    // 1..30 lines, quantity 1..20 (EBOOK forced to 1)
  "address_id": 3,                // required when any PRINT/BUNDLE item; must be the user's
  "shipping_method_id": 1,        // required when shipping is needed
  "discount_code": "MADANI15",    // optional, case/digit-insensitive
  "customer_note": "",            // optional, ≤ 500 chars
  "checkout_key": "uuid"          // POST /checkout/ only: client-generated per checkout attempt; same key → same order
}

// Quote
{
  "lines": [{
    "variant_id": 10, "book_id": 1, "book_slug": "…", "title": "حقوق مدنی دوجلدی",
    "cover": null, "subject_color": "#1F4E8C",
    "variant_type": "PRINT", "variant_type_label": "نسخه چاپی",
    "quantity": 1, "list_price": 2200000, "unit_price": 2000000, "line_total": 2000000,
    "in_stock": true, "available_quantity": 12      // null for EBOOK
  }],
  "items_total": 2000000,
  "discount": { "code": "MADANI15", "amount": 300000, "label": "۱۵٪ تخفیف" } | null,
  "discount_error": "این کد منقضی شده است." | null,  // the code was given but rejected; the quote still succeeds
  "needs_shipping": true,
  "shipping": ShippingOption | null,                 // the chosen method priced, null when none chosen / not needed
  "shipping_total": 0,
  "total": 1700000,
  "free_shipping_remaining": 0 | null,               // toman left to reach free shipping, null when n/a
  "ebook_now": true,                                 // any EBOOK/BUNDLE line: «بلافاصله پس از پرداخت در کتابخانه»
  "problems": [{ "variant_id": 12, "code": "out_of_stock" | "insufficient_stock" | "inactive" | "placeholder_price", "message": "…" }]
}
```

| Method & path | Auth | Response |
|---|---|---|
| `POST /checkout/quote/` | optional (anonymous allowed: guest sees prices before login) | `200 Quote`. `address_id` ignored when anonymous; `province` (string) may be sent instead to price shipping. Per-user discount limits are checked only when logged in. |
| `POST /checkout/` | required | `201 { "order": Order, "payment_url": "https://sandbox.zarinpal.com/pg/StartPay/A000…" }` — redirect the browser there. Free orders (`total == 0`) are marked paid at once: `payment_url` is `null`, go to `/checkout/result?order=<number>`. `400` with field errors, or `{ "problems": [...] }` when any line is unsellable, or `{ "discount_code": ["…"] }` when the code is invalid. `502 { "detail": "اتصال به درگاه پرداخت برقرار نشد…" }` when the gateway refuses; the order stays `PENDING_PAYMENT` and can be retried. |
| `POST /orders/<number>/pay/` | owner | Retry payment for a `PENDING_PAYMENT` order: `200 { "payment_url": … }`. Re-checks stock. |
| `GET /payments/zarinpal/callback/?Authority=…&Status=OK\|NOK` | none | Verifies **idempotently**, then `302` to `FRONTEND_URL/checkout/result?order=<number>&status=paid\|failed\|cancelled`. Calling it twice never double-charges or double-grants. |
| `GET /payments/fake/<authority>/` | dev only (`PAYMENT_GATEWAY=fake`) | HTML page with «پرداخت موفق» / «انصراف» buttons that hit the callback (local simulator). |

The 3 steps in the UI: **۱ ورود** (phone + OTP, skipped when logged in) → **۲ ارسال** (address + method; skipped for
ebook-only) → **۳ پرداخت** (summary, discount code, pay).

## Orders

```jsonc
// OrderSummary (list)
{ "number": "DR0507114821", "status": "PAID", "status_label": "پرداخت‌شده", "total": 1700000,
  "created_at": "…", "paid_at": "…" | null, "items_count": 2,
  "covers": [{ "title": "…", "cover": null, "subject_color": "#1F4E8C" }] }   // up to 3

// Order (detail)
OrderSummary & {
  "items": [{ "title": "…", "book_slug": "…" | null, "variant_type": "PRINT", "variant_type_label": "نسخه چاپی",
              "quantity": 1, "list_price": 2200000, "unit_price": 2000000, "line_total": 2000000,
              "cover": null, "subject_color": "#1F4E8C", "can_read": false }],   // can_read: has an active entitlement (ebook/bundle)
  "items_total": 2000000, "discount_total": 300000, "discount_code": "MADANI15" | "",
  "shipping_total": 0, "needs_shipping": true, "shipping_method_name": "پست پیشتاز",
  "shipping_address": { …Address snapshot without id… } | null, "tracking_code": "",
  "customer_note": "",
  "timeline": [{ "status": "PAID", "label": "پرداخت‌شده", "at": "…" }],
  "payment": { "status": "PAID", "ref_id": "123456", "card_pan": "6037******1234", "gateway": "zarinpal" } | null,
  "can_pay": false               // PENDING_PAYMENT and not timed out
}
```
- `GET /orders/` → paginated `{ count, next, previous, results: [OrderSummary] }`, newest first, owner only.
- `GET /orders/<number>/` → `Order` (owner only; 404 otherwise).

Status flow: `PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED`; `PENDING_PAYMENT → FAILED | CANCELLED`
(unpaid orders older than `ORDER_PAYMENT_TIMEOUT_MINUTES` are cancelled by a periodic job); ebook-only orders go
`PAID → DELIVERED` immediately. Every change writes an `OrderStatusLog`. Marking paid (one transaction):
decrement PRINT/BUNDLE stock, record the discount redemption, create ebook entitlements, bump `Book.sales_count`,
then (on commit) SMS the customer and send `order_paid`.

## Library (Phase 3 list; reader in Phase 4)

- `GET /library/` → `[{ "book": BookCard, "granted_at": "…", "source_order": "DR…" | null, "can_read": true }]`
- Entitlement check for other apps: `apps.library.services.entitlements.has_entitlement(user, book)`.

## Reviews (moderated)

```jsonc
// Review
{ "id": 1, "rating": 5, "body": "…", "author": "علی ر.", "exam_type": ExamTypeMini | null,
  "is_verified_purchase": true, "created_at": "…" }
```
- `GET /catalog/books/<slug>/reviews/` → `{ "summary": { "average": 4.6 | null, "count": 12, "distribution": {"5": 8, "4": 3, "3": 1, "2": 0, "1": 0} }, "results": [Review] }`
  (approved only, newest first, up to 20; `average` null when count < 3).
- `POST /catalog/books/<slug>/reviews/` (login) `{ "rating": 1..5, "body": "≤ 2000", "exam_type": "<slug>" | null }`
  → `201 { "status": "PENDING", "message": "نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود." }`. One per user and book
  (a second POST updates it and sends it back to moderation). `is_verified_purchase` = user has a paid order with that book.
- `GET /me/reviews/` → `[Review & { "status", "status_label", "book": { "title", "slug" } }]`.
- Admin: approve/reject actions in bulk; only approved reviews are public.

## Wishlist

- `GET /wishlist/` → `[{ "book": BookCard, "added_at": "…" }]`
- `POST /wishlist/` `{ "book_id": 1 }` → `201` (idempotent: `200` if already there). `DELETE /wishlist/<book_id>/` → `204`.
- `GET /wishlist/ids/` → `[1, 5, 9]` (cheap check for heart buttons).

## Not in Phase 3 (decisions / later)

- `GET /account/notify` list depends on Phase 2's back-in-stock model; wired when it lands.
- Shared book + course cart: needs academy (dadrose.com) integration — owner decision.
