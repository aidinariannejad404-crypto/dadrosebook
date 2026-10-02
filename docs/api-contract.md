# Phase 1 API contract (`/api/v1/`)

Both the backend serializers and `frontend/src/lib/types.ts` must match this file exactly.
All money values are integer **toman**. Dates are ISO `YYYY-MM-DD` (Gregorian). Image/file URLs are
absolute (`request.build_absolute_uri`) or `null`. Slugs are Unicode Persian.

Fields and params marked **(added after research)** come from the Phase 1 quick wins in
`docs/research/competitor-analysis.md` (P1-1 … P1-20); every older field is unchanged.

**Placeholder prices are never sold (P1-17, added after research):** variants with
`price_is_placeholder: true` are still listed in `variants`/`formats`, but they are ignored by
`min_price`, `card_price`, `card_format`, `bundle_saving`, the `min_price`/`max_price` filters and the
`price`/`-price` ordering. Show «قیمت به‌زودی» instead of a number for them.

## Shared shapes

```jsonc
// SubjectMini
{ "id": 1, "name": "حقوق مدنی", "slug": "حقوق-مدنی", "color": "#1F4E8C" }

// ExamTypeMini
{ "id": 1, "name": "کانون وکلا", "slug": "کانون-وکلا", "short_name": "کانون" }

// PersonMini
{ "id": 1, "name": "دکتر شکری", "slug": "دکتر-شکری" }

// PublisherMini
{ "id": 1, "name": "…", "slug": "…" }        // or null on books without a publisher

// Variant
{
  "id": 10,
  "type": "PRINT",                 // "PRINT" | "EBOOK" | "BUNDLE"
  "type_label": "نسخه چاپی",        // PRINT: نسخه چاپی · EBOOK: نسخه الکترونیک · BUNDLE: چاپی + الکترونیک
  "price": 2200000,
  "sale_price": null,              // int or null
  "effective_price": 2200000,      // sale_price if set and lower, else price
  "discount_percent": 0,           // int 0..100
  "in_stock": true,                // EBOOK always true; PRINT/BUNDLE: stock > 0
  "stock": 12,                     // null for EBOOK
  "price_is_placeholder": false,
  "bundle_saving": 440000          // (added after research, P1-7) int | null. Non-null only on the
                                   // BUNDLE variant: PRINT.effective + EBOOK.effective − BUNDLE.effective
                                   // when all three exist, none is a placeholder and the result > 0
}

// BookCard (lists, rails)
{
  "id": 1,
  "title": "حقوق مدنی دوجلدی",
  "subtitle": "",
  "slug": "حقوق-مدنی-دوجلدی-دکتر-شکری",
  "cover": null,                         // URL or null (frontend renders a subject-colour cover)
  "authors": [PersonMini],
  "subjects": [SubjectMini],             // ordered by Subject.order
  "exam_types": [ExamTypeMini],
  "min_price": 2200000,                  // lowest effective_price among active non-placeholder variants, null if none
  "card_price": 2200000,                 // price shown on cards: PRINT effective price, else cheapest (non-placeholder only; null → «قیمت به‌زودی»)
  "card_format": "PRINT",                // variant type card_price belongs to, null if none
  "formats": ["PRINT", "EBOOK", "BUNDLE"], // active variant types, in that order
  "in_stock": true,                      // any active variant in stock
  "print_in_stock": true,                // PRINT variant exists and stock > 0
  "is_quick_review": false,              // always equals resource_type == "QUICK_REVIEW"
  "volumes": 2,

  // --- added after research -------------------------------------------------------------------
  "resource_type": "TEXTBOOK",           // (P1-11) "TEXTBOOK" | "TESTS" | "LAWS" | "QUICK_REVIEW" | "COURSE_NOTES"
  "resource_type_label": "درسنامه",       // (P1-11) درسنامه · تست و مجموعه سؤالات · مجموعه قوانین · سریع‌خوان · جزوه دوره
  "has_sample": false,                   // (P1-4) sample_pdf set or at least one sample page
  "kit_role": null,                      // (P1-5) "essential" | "optional" | null — role in the active study kits of the
                                         // exam type given by ?exam_type=<one slug> on list/detail/related/home/study-kits;
                                         // null without exam_type, with several slugs, or when not in that exam's kits
  "edition_badge": null,                 // (P1-1) "ویرایش ۱۴۰۵" (Persian digits of publish_year) when publish_year >=
                                         // current exam year (Jalali year of the next upcoming ExamEvent, else this Jalali year)
  "law_updated_until": "",               // (P1-1) free text, e.g. "اصلاحات قانون حمایت خانواده ۱۴۰۴"; "" when unknown → «به‌روز تا: …»
  "course_badge": "دوره جامع حقوق مدنی ۱ تا ۸", // (P1-13) title of the first open related course, or null.
                                         // Since the course cross-sell: only courses linked as `referenced`
                                         // or `same_author` count (the badge reads «منبع دوره دادرُز»)
  "social_proof": {                      // (P1-14)
    "subject_rank": 1,                   //   1..3: rank by sales_count within the book's first subject (active books,
                                         //   ties → lower id first); null when > 3 or sales_count == 0
    "season_buyers": null                //   season_sales_count when ≥ 20, else null
  },
  "badges": [Badge]                      // (P1-20) ordered, at most 2 — render as-is
}

// Badge (added after research, P1-20). Priority order, first two that apply:
//   1 edition       label = edition_badge                          tone "primary"
//   2 kit_essential «ضروری کیت»  (kit_role == "essential")          tone "success"
//   3 bestseller    «پرفروش‌ترین #۱ حقوق مدنی» (subject_rank, first subject name) tone "accent"
//   4 quick_review  «سریع‌خوان»                                      tone "warning"
//   5 bundle        «چاپی + الکترونیک» (active non-placeholder BUNDLE) tone "info"
//   6 sample        «نمونه رایگان» (has_sample)                      tone "neutral"
//   7 course        «منبع دوره دادرُز» (course_badge)                 tone "info"
{ "code": "bestseller", "label": "پرفروش‌ترین #۱ حقوق مدنی", "tone": "accent" }
// code: "edition" | "kit_essential" | "bestseller" | "quick_review" | "bundle" | "sample" | "course"
// tone: "primary" | "success" | "accent" | "warning" | "info" | "neutral"

// StoreSettings (added after research, P1-6) — singleton edited in the admin («تنظیمات فروشگاه»)
{
  "free_shipping_threshold": null,       // int toman, or null when there is no free shipping
  "print_dispatch_note": "ارسال حداکثر ۱ روز کاری پس از سفارش",
  "delivery_tehran_note": "تحویل تهران ۱ تا ۲ روز کاری",
  "delivery_province_note": "سایر شهرها ۳ تا ۵ روز کاری",
  "consult_whatsapp": "",                // international digits without "+" (e.g. "989121234567") → https://wa.me/<n>?text=…; "" = hide
  "consult_telegram": "",                // username without "@" → https://t.me/<u>; "" = hide
  "support_hours": "",                   // e.g. "همه روزه ۹ تا ۲۱"; "" = hide
  "enamad_html": "",                     // sanitised trust-seal snippet (only <a>/<img>, https, rel="noopener"); render as HTML; "" = hide
  "students_count_claim": ""             // owner-confirmed claim, e.g. "+۱۵٬۰۰۰ دانشجوی آکادمی دادرُز"; "" = hide
}
```

## Endpoints

### `GET /catalog/home/`
Query **(added after research, P1-3)**: `exam_type` (one slug). When it names an active exam type,
`bestsellers` and `quick_review` only contain books of that exam type, `next_exam` is that exam type's
next event (falls back to the unfiltered next event when it has none), cards carry `kit_role`, and
`subjects` carry `weight` and are ordered by it. Unknown/inactive slugs are ignored
(`selected_exam_type: null`). The response is cached per full URL (so per `exam_type`) for
`HOME_CACHE_SECONDS`.
```jsonc
{
  "next_exam": { "id": 1, "name": "آزمون کانون وکلا ۱۴۰۵", "date": "2026-11-05", "exam_type": ExamTypeMini } | null,
  "exam_types": [ExamTypeMini],
  "subjects": [SubjectMini & { "book_count": 3, "weight": 4 }],
                                         // weight (added after research, P1-10): ضریب of the subject for the selected
                                         // exam type (StudyKitRecommendation.weight), null otherwise. With an exam type:
                                         // ordered by weight desc, unweighted last, then Subject.order

  "categories": [CategoryNode],          // top-level categories with children (see below)
  "hero_banners": [Banner],
  "course_banners": [Banner],
  "bestsellers": [BookCard],             // up to 12, by sales_count desc
  "quick_review": [BookCard],            // up to 12, is_quick_review=true
  "featured_course": Course | null,      // first active course
  "guide_videos": [GuideVideo],          // up to 6
  "selected_exam_type": ExamTypeMini | null, // (added after research, P1-3)
  "store": StoreSettings                 // (added after research, P1-6)
}
// Banner
{ "id": 1, "title": "…", "subtitle": "…", "image": null, "link_url": "/kit", "link_label": "…" }
// Course
{ "id": 1, "title": "دوره جامع حقوق مدنی ۱ تا ۸", "url": "https://dadrose.com/…", "price": 8125000, "image": null }
// GuideVideo
{ "id": 1, "title": "…", "video_url": "https://…", "thumbnail": null, "subject": SubjectMini | null, "exam_type": ExamTypeMini | null }
// CategoryNode
{ "id": 1, "name": "آزمون وکالت", "slug": "آزمون-وکالت", "children": [CategoryNode] }
```

### `GET /catalog/books/`
Query: `q`, `subject` (slug, repeatable or comma separated), `exam_type` (slug, same), `category` (slug,
includes descendants), `format` (`print|ebook|bundle`, comma separated), `min_price`, `max_price`
(on min effective price), `in_stock` (`true`), `featured` (`true`), `quick_review` (`true`), `ordering`
(`-sales_count` default, `price`, `-price`, `-created_at`, `title`), `page`, `page_size` (≤ 48, default 24).
Price filters and price ordering use non-placeholder prices only; books without one sort last.

**Added after research:** `has_sample` (`true`: sample PDF or sample pages, P1-4), `resource_type`
(`TEXTBOOK|TESTS|LAWS|QUICK_REVIEW|COURSE_NOTES`, comma separated or repeated, case-insensitive,
unknown values ignored, P1-11). A single `exam_type` slug also fills `kit_role` on the cards (P1-5).
```jsonc
{ "count": 13, "next": null, "previous": null, "results": [BookCard] }
```

### `GET /catalog/books/<slug>/`
`BookCard` plus:
```jsonc
{
  "publisher": PublisherMini | null,
  "translators": [PersonMini],
  "categories": [{ "id": 1, "name": "…", "slug": "…" }],
  "edition": "ویرایش سوم",        // free text, may be ""
  "publish_year": 1404,           // Jalali year int or null
  "pages": 820, "isbn": "",
  "description": "<p>…</p>",      // sanitised HTML: p, br, strong/b, em/i, u, s, ul/ol/li, blockquote,
                                  // h2–h4, a[href], span, hr, img[src alt width height] (http/https),
                                  // table/thead/tbody/tr/th/td[colspan rowspan]
  "table_of_contents": "…",       // plain text, newline separated
  "study_plan_note": "…",         // plain text
  "study_days": 12,               // (added after research, P1-16) suggested study days, int or null
  "sample_pdf": null,
  "sample_pages": [{ "id": 1, "image": "https://…", "order": 1 }],
  "intro_video_url": "",
  "variants": [Variant],          // active only, order PRINT, EBOOK, BUNDLE
  "related_courses": [Course],
  "kit_placements": [{ "exam_type": ExamTypeMini, "subject": SubjectMini, "order": 1, "is_essential": true }],
  "is_featured": false,
  "updated_at": "2026-10-02T14:00:00Z"
}
```
404 `{ "detail": "…" }` for unknown/inactive slug. Query (added after research): `exam_type` (one slug)
fills `kit_role`. `edition`, `publish_year` and `pages` feed JSON-LD `bookEdition`/`numberOfPages`.

### `GET /catalog/books/<slug>/related/`
`[BookCard]`, up to 8, sharing a subject, excluding the book, by sales_count desc.
Query **(added after research)**: `in_stock=true` keeps only books with an in-stock variant (alternatives
for a sold-out book, P1-8); `exam_type` (one slug) fills `kit_role`.

### Taxonomies
- `GET /catalog/subjects/` → `[SubjectMini & { "book_count": n }]` (no pagination)
- `GET /catalog/exam-types/` → `[ExamTypeMini]`
- `GET /catalog/categories/` → `[CategoryNode]` (tree from roots)
- `GET /catalog/categories/<slug>/` → `CategoryNode & { "description": "", "parent": {id,name,slug} | null }`
- `GET /catalog/exam-events/` → `[{ id, name, date, exam_type: ExamTypeMini }]` upcoming (date ≥ today), ascending
- `GET /catalog/study-kits/?exam_type=<slug>&subject=<slug,…>` →
  `[{ "exam_type": ExamTypeMini, "subject": SubjectMini, "note": "", "weight": 4, "items": [{ "order": 1, "is_essential": true, "book": BookCard & {"variants": [Variant]} }] }]`
  `weight` (added after research, P1-10): «ضریب درس», int or null. Within an exam type, kits are ordered
  by weight desc (null last), then subject order. With `exam_type`, item books carry `kit_role`.

### `GET /store/settings/` (added after research, P1-6)
→ `StoreSettings` (also embedded in `/catalog/home/` as `store`).

### `GET /health/` → `{ "status": "ok" }`

---

## Course cross-sell and study-plan lead magnet (added for academy courses)

Decisions: course purchase links out to dadrose.com (UTM added by the frontend), one admin-editable
discount code per subject, free first-session video on book pages, study plan unlocked by a mobile number.

```jsonc
// Course (full shape; RelatedCourse is extended into this)
{
  "id": 1,
  "title": "دوره جامع حقوق مدنی ۱ تا ۸",
  "url": "https://dadrose.com/courses/…",
  "course_type": "FULL",            // FULL | ESSENTIALS | TIPS_TESTS | REVIEW | WORKSHOP_ADVICE | MOCK | PACKAGE | OTHER
  "course_type_label": "دوره جامع",  // FULL دوره جامع · ESSENTIALS امهات · TIPS_TESTS نکته و تست · REVIEW جمع‌بندی · WORKSHOP_ADVICE مشاوره و کارگاه · MOCK آزمون آزمایشی · PACKAGE پکیج · OTHER سایر
  "subject": SubjectMini | null,
  "exam_types": [ExamTypeMini],
  "teachers": ["امین بیات"],
  "price": 8125000,                 // toman; 0 for free
  "sale_price": null,
  "effective_price": 8125000,
  "is_free": false,
  "hours": 120,                     // int or null
  "sessions": 60,                   // int or null
  "price_per_hour": 67708,          // effective_price / hours, null if unknown or free
  "students_count": 1200,           // null unless ≥ 100 (honest social proof)
  "rating": 4.8,                    // null unless reviews_count ≥ 3 and rating ≥ 4.5
  "reviews_count": 12,
  "image": null,
  "intro_video_url": "https://www.aparat.com/v/…",  // "" when none
  "short_description": "…",          // plain text ≤ 300 chars
  "selling_points": ["…"],
  "relevance": "referenced",        // only inside a book's course_offer: referenced | same_author | same_subject | general
  "relevance_label": "تدریس‌شده بر اساس همین کتاب"   // referenced: «تدریس‌شده بر اساس همین کتاب» · same_author: «تدریس توسط مؤلف همین کتاب» · same_subject: «دوره همین درس» · general: «مهارت آزمون»
}
```

### Book detail gains `course_offer` (null when no open course is relevant)
```jsonc
"course_offer": {
  "subject": SubjectMini | null,
  "recommended_type": "ESSENTIALS",          // by days to the selected/next exam: >60 FULL, 15–60 ESSENTIALS, <15 TIPS_TESTS/REVIEW
  "recommended_reason": "۳۳ روز تا آزمون کانون وکلا؛ وقت جمع‌بندی و امهات است",
  "highlight": Course | null,                // referenced or same_author course, shown first and big
  "tiers": [                                 // good-better-best, max 3, order: best, better, good (anchoring)
    Course & { "tier": "best" | "better" | "good", "is_recommended": true }
  ],
  "more": [Course],                          // other relevant open courses, max 4
  "free_sample": { "course": Course, "video_url": "https://…" } | null,
  "discount": {                              // from SubjectCourseDiscount (admin); null when none active
    "code": "MADANI15",
    "percent": 15,                           // int or null
    "label": "۱۵٪ تخفیف دوره‌های حقوق مدنی برای خریداران این کتاب",
    "expires_on": "2026-11-05",              // date; defaults to the next exam date
    "days_left": 33
  } | null,
  "exam_countdown": { "exam_name": "آزمون کانون وکلا ۱۴۰۵", "date": "2026-11-05", "days_left": 33 } | null
}
```
`related_courses` stays (open courses linked to the book) for compatibility.

### `GET /catalog/courses/?subject=<slug>&course_type=<TYPE>&exam_type=<slug>` → `[Course]` (open courses only)

### Study plan lead magnet
- `POST /leads/study-plan/` body `{ "phone": "09121234567", "exam_type": "کانون-وکلا", "subjects": ["حقوق-مدنی"], "books": ["<book slug>"], "hours_per_day": 6, "consent": true }`
  → `201 { "token": "<uuid>", "plan_url": "/plan/<uuid>" }`. 400 `{field: [errors]}` on invalid phone / missing consent.
  Throttled (10/hour per IP). Phone normalised to `09xxxxxxxxx`.
- `GET /leads/study-plan/<token>/` →
```jsonc
{
  "token": "…",
  "created_at": "…",
  "phone_masked": "0912***4567",
  "exam": { "name": "آزمون کانون وکلا ۱۴۰۵", "date": "2026-11-05", "days_left": 33 } | null,
  "hours_per_day": 6,
  "summary": { "total_pages": 2100, "study_days": 28, "review_days": 5, "pages_per_day": 75 },
  "days": [ { "date": "2026-10-03", "items": [ { "subject": SubjectMini, "book_title": "…", "book_slug": "…", "pages_from": 1, "pages_to": 75, "task": "مطالعه" } ] } ],
  "review": [ { "date": "2026-10-31", "task": "جمع‌بندی و تست حقوق مدنی" } ],
  "recommended_courses": [Course]           // max 3, by the same timing rule
}
```

## Phase 4: secure ebook reader (`apps.reader`)

All endpoints below require an authenticated user (Phase 3 JWT cookie; the browser calls them with
`credentials: "include"`). Errors: `401 {"detail": "…"}` when not signed in, `403 {"detail": "…",
"code": "no_entitlement"}` when the user does not own the ebook, `404 {"detail": "…", "code":
"no_ebook"}` when the book has no active ebook file. `<slug>` is the book slug (Unicode, URL-encoded).
Responses carry `Cache-Control: private, no-store`.

### `GET /library/<slug>/read/` → reader session
```jsonc
{
  "book": { "slug": "…", "title": "…", "subtitle": "…", "cover": "https://…" | null,
            "authors": ["…"], "subjects": [SubjectMini] },
  "file": {
    "format": "PDF",                          // PDF | EPUB (frontend renders PDF; EPUB shows «به‌زودی»)
    "version": 3,
    "url": "https://…signed…",                // short-lived; fetch the whole file once (no range requests)
    "expires_at": "2026-10-02T19:05:00Z"      // ~5 min (READER_URL_TTL_SECONDS); call this endpoint again to refresh
  },
  "progress": ReadingProgress | null,
  "watermark": "0912***4567 · ۱۴۰۵/۰۷/۱۰"      // drawn over every page by the frontend
}
```

### `GET /library/files/<token>/` → the file bytes (dev / local storage only)
Signed, user-bound, expiring token minted by `/read/`. `Content-Disposition: inline`, `no-store`,
`X-Content-Type-Options: nosniff`. In production (`USE_S3=1`) `file.url` is instead a pre-signed
URL on the private bucket with the same TTL. Expired/tampered token → 403. The URL is
self-authenticating (fetch it with `withCredentials: false`); the token names the user and file
version it was minted for, and the entitlement is re-checked when it is redeemed.

### Reading progress
`ReadingProgress = { "page": 37, "total_pages": 412, "percent": 8.98, "location": "", "updated_at": "…" }`
(`location` is free text for EPUB CFI; empty for PDF).
- `GET /library/<slug>/progress/` → `ReadingProgress` (404 `code: "no_progress"` when none).
- `PUT /library/<slug>/progress/` body `{ "page": 37, "total_pages": 412, "location": "" }` → `ReadingProgress`.
  `page` ≥ 1, `page` ≤ `total_pages`. `percent` is computed by the server.

### Highlights
```jsonc
Highlight = {
  "id": 12,
  "page": 37,
  "text": "عین عبارت انتخاب‌شده",             // ≤ 2000 chars
  "note": "یادداشت کاربر",                     // ≤ 2000 chars, may be ""
  "color": "yellow",                          // yellow | green | blue | pink
  "rects": [ { "x": 0.12, "y": 0.40, "w": 0.55, "h": 0.02 } ],  // fractions of the page box (0..1), ≤ 50
  "location": "",                             // EPUB CFI range, "" for PDF
  "created_at": "…", "updated_at": "…"
}
```
- `GET /library/<slug>/highlights/?page=37` → `[Highlight]` ordered by page then created (page filter optional).
- `POST /library/<slug>/highlights/` body `{page, text, note?, color?, rects, location?}` → `201 Highlight`.
- `PATCH /library/<slug>/highlights/<id>/` body `{note?, color?}` → `Highlight`.
- `DELETE /library/<slug>/highlights/<id>/` → `204`.
Highlights and progress are kept even if the entitlement is later revoked, but every endpoint
re-checks the entitlement.
