# Phase 2 API contract (`/api/v1/`) — discovery, study kit, cart, back-in-stock

Extends `docs/api-contract.md` (all shared shapes — `BookCard`, `Variant`, `SubjectMini`… — come from
there). Money is integer **toman**. Backend serializers and `frontend/src/lib/types.ts` must match this
file exactly. Phase 3 consumes the cart: the shapes and `apps.cart.services` function names below are
stable; extend them only by adding fields.

## Cart identity

- A guest cart is identified by an opaque UUID **cart token**. The browser keeps it in `localStorage`
  (`dadrose_cart_token`) and also in a first-party cookie of the same name (so server components can
  read it), and sends it on every cart call as the header **`X-Cart-Token: <uuid>`**.
- Every mutating call creates a cart when the header is missing or names an unknown/expired cart, and
  returns the (possibly new) `token` in the body; the client stores whatever token comes back.
- `GET /cart/` without a valid token returns an empty cart with `"token": null` (no row is created).
- **Phase 3 (logged-in users):** when `request.user` is authenticated the user's cart is used. If the
  request also carries a guest token for a different anonymous cart, that cart is merged into the
  user's cart first (`apps.cart.services.merge_guest_cart(guest_cart, user)`), so the guest cart merges
  on the first authenticated call after login. Phase 3's OTP verify view may call
  `merge_guest_cart(get_cart_by_token(token), user)` directly as well.
- Anonymous carts untouched for `CART_TTL_DAYS` (60) are deleted by `python manage.py purge_carts`
  (also a Celery task `apps.cart.tasks.purge_stale_carts`).

## Shapes

```jsonc
// CartBook — enough to render a line without another request
{ "id": 1, "title": "…", "slug": "…", "cover": null, "subjects": [SubjectMini], "authors": [PersonMini] }

// CartItem
{
  "id": 7,
  "variant": Variant,              // live variant (same shape as product detail)
  "book": CartBook,
  "quantity": 2,
  "max_quantity": 10,              // EBOOK: 1 · PRINT/BUNDLE: min(stock, CART_MAX_QUANTITY=10); 0 when unavailable
  "unit_price": 2200000,           // variant.effective_price (live, not a snapshot; Phase 3 snapshots at checkout)
  "line_total": 4400000,           // unit_price × quantity
  "line_saving": 0,                // (price − effective_price) × quantity
  "is_available": true,            // variant & book active, not a placeholder price, in stock, quantity ≤ max_quantity
  "issue": null                    // null | "out_of_stock" | "insufficient_stock" | "unavailable" | "price_unavailable"
}

// Cart
{
  "token": "6f0c…" | null,
  "items": [CartItem],             // oldest first
  "item_count": 3,                 // sum of quantities of all items
  "subtotal": 5100000,             // sum of line_total over available items
  "original_subtotal": 5600000,    // sum of price × quantity over available items
  "savings": 500000,               // original_subtotal − subtotal
  "has_physical": true,            // any available PRINT/BUNDLE item (shipping applies, Phase 3)
  "has_issues": false,             // any item with is_available == false (checkout blocked until fixed)
  "free_shipping_threshold": null, // StoreSettings.free_shipping_threshold
  "free_shipping_remaining": null, // threshold − subtotal when has_physical and > 0, else null
  "updated_at": "2026-10-02T18:00:00Z" | null
}

// CartError (400) — always this shape for business-rule errors
{ "code": "out_of_stock", "detail": "پیام فارسی برای نمایش", "cart": Cart | null }
// code: "out_of_stock" | "insufficient_stock" | "price_unavailable" | "unavailable"
//       | "already_in_bundle" | "invalid_quantity" | "not_found"
```

Business rules (`apps.cart.services`):
- Quantity 1..`max_quantity`. EBOOK is always quantity 1 (adding again keeps 1).
- Adding an existing variant increments its quantity, clamped to `max_quantity`
  (a clamp is not an error; the response cart shows the clamped quantity).
- Placeholder-priced or inactive variants/books can't be added (`price_unavailable` / `unavailable`).
  Out-of-stock PRINT/BUNDLE can't be added (`out_of_stock`).
- Adding a BUNDLE removes the same book's EBOOK line (the bundle includes it). Adding an EBOOK when
  the same book's BUNDLE is in the cart → 400 `already_in_bundle`.
- Reads never mutate: lines whose stock dropped are flagged via `is_available`/`issue`.

## Endpoints

| Method & path | Body | Response |
|---|---|---|
| `GET /cart/` | — | `200 Cart` |
| `POST /cart/items/` | `{ "variant_id": 10, "quantity": 1 }` (quantity optional, default 1) | `201 Cart` · `400 CartError` |
| `PATCH /cart/items/<id>/` | `{ "quantity": 3 }` (0 removes the line) | `200 Cart` · `400 CartError` · `404 CartError(not_found)` |
| `DELETE /cart/items/<id>/` | — | `200 Cart` · `404 CartError(not_found)` |
| `POST /cart/items/bulk/` | `{ "items": [{ "variant_id": 10, "quantity": 1 }], "source": "kit" }` (≤ 50 items) | `200 { "cart": Cart, "added": [variant_id], "skipped": [{ "variant_id": 11, "code": "out_of_stock", "detail": "…" }] }` |
| `DELETE /cart/` | — | `200 Cart` (emptied, token kept) |

`source` is informational (`"kit"` | `"product"` | `"card"` | `"other"`); bulk never fails as a whole for
per-item errors. All cart responses are `Cache-Control: no-store`.

## Back-in-stock («موجود شد خبرم کن»)

`POST /back-in-stock/` body `{ "variant_id": 10, "phone": "09121234567", "source": "product" }`
(`source`: `"product"` | `"card"` | `"cart"` | `"kit"`, optional).
- `201 { "id": 3, "status": "PENDING", "created": true, "message": "…" }` — new request.
- `200` same shape with `"created": false` when a pending request for that phone + variant exists.
- `400 { "phone": ["…"] }` invalid phone; `400 { "code": "in_stock", "detail": "…" }` when the variant
  is in stock (EBOOK is always in stock); `400 { "code": "unavailable", "detail": "…" }` for an
  inactive variant/book; `404` unknown variant. Throttled (`back_in_stock`, 10/hour per IP).
- Phone normalised to `09xxxxxxxxx`. When `request.user` is authenticated (Phase 3) the user is linked.

`BackInStockRequest`: variant, phone, user (null), source, status (`PENDING` → `NOTIFIED` | `CANCELLED`),
notified_at, converted_at (Phase 3 sets it when that phone/user buys the variant within 30 days:
`apps.engagement.services.mark_converted(variant_id, phone, user)`). When a PRINT variant's stock
goes from 0 to > 0 (admin save or import), a Celery task SMSes every pending request through
`SmsProvider` and marks them NOTIFIED. The admin lists requests with filters, a «اطلاع‌رسانی اکنون» action,
and per-variant pending counts.

## Search and category discovery

### `GET /catalog/books/` is the result list for `/category/<slug>` and `/search`.
Phase 1 params unchanged. **Relaxed fallback (Phase 2):** when `q` has more than one word and the strict
search (every word must match) finds nothing, the list returns books matching *any* word (other filters
kept), ranked by words matched, and sets the response header `X-Search-Relaxed: 1` (exposed via CORS).
`/catalog/books/facets/` applies the same fallback so its `count` agrees.

### `GET /catalog/books/facets/` — same query params as the list (except `page`, `page_size`, `ordering`)
Counts are computed on the result set with **that facet's own filter removed** (so a user can switch
within a facet), all other filters applied.
```jsonc
{
  "count": 42,                                  // results with every filter applied
  "subjects":       [{ "slug": "حقوق-مدنی", "name": "حقوق مدنی", "color": "#1F4E8C", "count": 12 }],  // count > 0, by Subject.order
  "exam_types":     [{ "slug": "کانون-وکلا", "name": "کانون وکلا", "count": 30 }],                    // by ExamType.order
  "formats":        [{ "value": "PRINT", "label": "نسخه چاپی", "count": 40 }],                         // PRINT, EBOOK, BUNDLE
  "resource_types": [{ "value": "TEXTBOOK", "label": "درسنامه", "count": 20 }],
  "in_stock": 38,                               // results that would remain with in_stock=true
  "price": { "min": 180000, "max": 4200000 }    // over non-placeholder min_price, null values when none
}
```

### `GET /catalog/search/suggest/?q=<text>` — header autocomplete
`q` normalised like the list; fewer than 2 characters → all lists empty. Cached 60s per query.
```jsonc
{
  "q": "مدنی",                                  // the normalised query
  "books": [{ "id": 1, "title": "…", "slug": "…", "cover": null, "subjects": [SubjectMini], "authors": [PersonMini], "card_price": 2200000 }], // ≤ 6, by sales_count
  "subjects": [SubjectMini],                    // ≤ 4, name contains the query
  "categories": [{ "id": 1, "name": "…", "slug": "…" }], // ≤ 4
  "authors": [PersonMini]                       // ≤ 4, people who author an active book
}
```

### Study kit (`/kit`)
Uses the existing `GET /catalog/study-kits/?exam_type=<slug>` (Phase 1) and `POST /cart/items/bulk/`
with `source: "kit"`. The page fires `kit_built` with `{ exam_type, subjects, items, value }`.
The kit selection is encoded in the URL (`/kit?exam=<slug>&s=<subject,…>`) so it can be shared.
