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
    "url": "https://…signed…",                // S3 pre-signed, or relative "/api/v1/library/files/<token>/" locally; short-lived; fetch the whole file once (no range requests)
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

## Phase 6: ebook platform — EPUB streaming, bookmarks, devices, search (`apps.reader`)

Same rules as Phase 4: authenticated, entitlement re-checked on every call, `Cache-Control: private,
no-store`. New error codes: `409 {"code": "device_limit", "detail": "…", "devices": [Device]}` and
`429 {"detail": "…"}` (throttled; the reader shows «کمی صبر کنید»).

### Device header
Every reader call from the browser sends `X-Reader-Device: <uuid>` (a random v4 id the reader keeps
in `localStorage["dadrose.reader.device"]`, created on first use). `GET /read/` registers it. A user
may read on at most `READER_MAX_DEVICES` (default 3) devices seen in the last 90 days; a fourth new
device gets the `409 device_limit` answer above until the user removes one. Missing header → the
server treats the request as device `"unknown"` (counted like any other device).
`Device = { "id": 7, "label": "Chrome · Android", "last_seen": "…", "current": true }`
- `GET /library/devices/` → `[Device]` (`current` = this request's device).
- `DELETE /library/devices/<id>/` → `204` (throttled to 5 removals per day).

### `GET /library/<slug>/read/` (extended)
Adds, for both formats:
```jsonc
{
  …Phase 4 fields…,
  "file": { "format": "EPUB", "version": 2, "url": "", "expires_at": "…" },  // url is "" for EPUB: nothing to download
  "copy_limit": 1000,            // max characters one copy may take; the reader appends a citation
  "epub": null | {               // present when format == "EPUB"
    "language": "fa",
    "direction": "rtl",          // "rtl" | "ltr"
    "total_pages": 213,          // virtual pages (~1200 characters each), stable per file version
    "chapters": [ { "index": 0, "title": "پیشگفتار", "start_page": 1, "pages": 3, "chars": 3410 } ],
    "toc": [ { "title": "فصل اول", "chapter": 2, "anchor": "", "level": 0 },
             { "title": "مبحث اول", "chapter": 2, "anchor": "s1", "level": 1 } ]   // flat, in reading order
  }
}
```
Progress for EPUB: `page` = virtual page (1..total_pages), `total_pages` = `epub.total_pages`,
`location` = `"epub:<chapter>:<charOffset>"` (offset into the chapter's text, see below).
Highlights for EPUB: `page` = virtual page of the start, `rects: []`,
`location` = `"epub:<chapter>:<start>-<end>"`.

**Text offsets** are offsets into `root.textContent` of the element the chapter `html` was inserted
into (UTF-16 code units, i.e. JS string indices).

### `GET /library/<slug>/epub/chapters/<index>/` → one chapter
```jsonc
{
  "index": 3, "title": "فصل دوم", "start_page": 12, "pages": 5, "chars": 6020,
  "prev": 2, "next": 4,          // null at the ends
  "html": "<h2 id=\"s1\">…</h2><p>…</p>"
}
```
`html` is sanitized server-side (no scripts, styles, iframes, forms, event handlers or publisher CSS;
allowed: headings, p, div, span, section, blockquote, ol/ul/li, dl/dt/dd, table/thead/tbody/tr/th/td,
em/strong/b/i/u/sub/sup/small/mark, br/hr, figure/figcaption, img, a, aside; attributes id, dir,
lang, colspan, rowspan, alt, src, href, title). Links:
- internal → `href="#epub:<chapter>:<anchor>"` (anchor may be empty) — the reader navigates itself;
- external `http(s)` → kept; every `<a>` carries `rel="noopener noreferrer nofollow" target="_blank"`;
- element ids are prefixed: anchor `s1` is the element `id="epub-s1"` (avoids clashing with page ids);
- anything else removed.
Images: `src` is a relative signed `/api/v1/library/epub-assets/<token>/` URL (same TTL as files;
refetch the chapter if they fail). Throttled: `READER_CHAPTER_RATE` (30/min) and
`READER_CHAPTER_DAY_RATE` (800/day) per user.

### `GET /library/epub-assets/<token>/` → image bytes
Self-authenticating like `/library/files/<token>/`; `no-store`, `nosniff`, image types only.

### `GET /library/<slug>/epub/search/?q=ماده ۱۰` → in-book search
`q` 2–100 characters, matched after one-to-one folding (ي/ى→ی، ك→ک، Persian/Arabic digits→ASCII,
ZWNJ→space, per-character lowercase when it stays one character; no whitespace collapsing).
```jsonc
{ "results": [ { "chapter": 3, "title": "فصل دوم", "occurrence": 0,      // nth match in that chapter (0-based)
                 "before": "…متن قبل", "match": "ماده ۱۰", "after": "متن بعد…" } ],
  "truncated": false }                                                    // at most 100 results
```
The reader opens the chapter and selects the `occurrence`-th folded match of `q` in its text.
Throttled `READER_SEARCH_RATE` (30/min).

### Bookmarks (PDF and EPUB)
`Bookmark = { "id": 4, "page": 37, "location": "", "label": "", "created_at": "…" }`
(`location` = `"epub:<chapter>:<offset>"` for EPUB, `""` for PDF; `label` ≤ 120 chars.)
- `GET /library/<slug>/bookmarks/` → `[Bookmark]` ordered by page.
- `POST /library/<slug>/bookmarks/` `{page, location?, label?}` → `201 Bookmark`; the same
  `(page, location)` again → `200` with the existing one. Max 500 per book.
- `DELETE /library/<slug>/bookmarks/<id>/` → `204`.

## Phase 6b: devices page, total copy quota, notebook export, offline reading (`apps.reader`)

### Session additions (`GET /library/<slug>/read/`)
```jsonc
{
  …,
  "copy_quota": { "limit": 12000, "used": 340 },  // characters per user per book, all devices, all time
  "offline": null | { "max_books": 3, "days": 14, "license": null | OfflineLicense }  // EPUB only; null for PDF or when disabled
}
```
`copy_quota.limit` = 10% of the EPUB's characters (at least `READER_COPY_QUOTA_MIN`, 2000), or
`READER_PDF_COPY_QUOTA` (20000) for PDF. The per-copy cap `copy_limit` still applies.

### `POST /library/<slug>/copies/` body `{ "chars": 420 }` → `{ "limit": 12000, "used": 760, "granted": 420 }`
Records a copy the reader just made. The reader truncates each copy to
`min(copy_limit, limit - used)` *before* writing the clipboard (using its last known `used`), then
reports it; `granted` is what the server accepted (`min(chars, remaining)`). When `used >= limit` the
reader puts only the citation line on the clipboard and says «سهمیه کپی این کتاب تمام شده است».
Throttled `READER_COPY_RATE` (60/min).

### `GET /library/<slug>/notes/export/?format=md|html` → a file (attachment)
The user's highlights (quote + colour + note), notes and bookmarks for the book, grouped by chapter
(EPUB) or page (PDF), with book title/authors and the Jalali export date. `md` → `text/markdown`,
`html` → a standalone RTL print-friendly page (`text/html`, the user can print it to PDF). Each quote
is cut to 300 characters and all quotes together to `copy_quota.limit` characters (notes are the
user's own words and are never cut). Requires the entitlement. `Content-Disposition: attachment`.

### Offline reading (EPUB only)
`OfflineLicense = { "id": 5, "book": "<slug>", "title": "…", "device_label": "Chrome · Android",
"expires_at": "…", "created_at": "…" }`
- `POST /library/<slug>/offline/` (with `X-Reader-Device`) → `201 { "license": OfflineLicense,
  "package": { "epub": <same as session.epub>, "chapters": [<chapter payload, html with images inlined
  as data: URIs>], "watermark": "…", "copy_limit": 1000, "copy_quota": {…} } }`. At most `max_books`
  live licenses per user (409 `{"code": "offline_limit", "licenses": [OfflineLicense]}` beyond that);
  calling again for the same book and device renews it (200). Throttled 10/day.
- `GET /library/offline/` → `[OfflineLicense]` (live ones).
- `DELETE /library/offline/<id>/` → `204`.
The reader stores the package encrypted (AES-GCM, non-extractable key kept in IndexedDB) and deletes
it when the license expires, when the server says 403/404 for the book, or when the license is gone
from `GET /library/offline/` on the next online open.

## Phase 5 — SEO: redirects, 404 reports, sitemap

Full spec (models, key rules, seeded redirects, frontend middleware): `docs/phase-5-contract.md` §1–2.

**`redirect_key(path)`** (Python `apps.seo.services.keys.redirect_key`, TypeScript twin in the
frontend middleware — both must agree): drop query string and fragment → URL-decode until stable
(max 3 rounds) → ي/ى→ی، ك→ک, spaces and ZWNJ → `-` → lowercase ASCII, collapse repeated `/`,
strip the trailing `/` (root stays `/`). Example: `/product/%D8%A2%D9%8A%D9%8A%D9%86/?x=1` → `/product/آیین`.

### `GET /seo/redirects/` → active redirects (cached in Redis 300 s, busted on save/delete)
```jsonc
{
  "version": "3f9a1c0d2b7e4a51",                       // hash of the map; changes when it changes
  "redirects": {
    "/product/آیین-دادرسی-مدنی-قدیمی": ["/product/آیین-دادرسی-مدنی", 301],
    "/products": ["/search", 301],
    "/blog": ["https://dadrose.com/blog/", 301]        // targets: internal path or absolute https URL
  }
}
```
Keys are `redirect_key(old_path)`. Response carries `Cache-Control: public, max-age=60`.

### `POST /seo/redirects/hit/` body `{ "path": "/product/…" }` → `204`
Counts a redirect the frontend just served (`hit_count += 1`, `last_hit_at`), matched by key.
Unknown/inactive path → `204`, no-op. Missing `path` → `400`. Throttled (scope `seo_beacon`,
`SEO_BEACON_THROTTLE_RATE`, default `120/min` per client IP) → `429` when exceeded.

### `POST /seo/not-found/` body `{ "path": "/x", "referer": "https://…" | "" | null }` → `204`
Upserts a 404 report (`hits += 1`, `last_seen`, `last_referer` when non-empty). Ignored (still
`204`): paths not starting with `/`, longer than 500 characters, or whose first segment is
`/_next`, `/api`, `/static`, `/media`, `/admin`. Same throttle scope as the hit beacon.
Both beacons accept `Content-Type: application/json` **and** `text/plain` with a JSON body, so
`navigator.sendBeacon(url, JSON.stringify(body))` works without a CORS preflight.

### `GET /seo/sitemap/` (cached 300 s)
```jsonc
{
  "books": [{ "slug": "…", "updated_at": "2026-10-02T12:00:00Z", "cover": "https://…" | null }],
  "categories": [{ "slug": "…", "updated_at": "…" }],
  "subjects": [{ "slug": "…", "updated_at": "…" }],
  "exam_types": [{ "slug": "…", "updated_at": "…" }]
}
```
Only active books with at least one active variant; a book's `updated_at` is the later of the book
and its active variants (UTC, `Z`). Taxonomies: active only. Lists are sorted by slug.

## Package «د» — trust and conversion (impl/trust)

Report items د۱–د۴ (`ux-seo-research/report.md`; JTBD appendix R3, R4, R5, R17). Money is integer
toman, dates ISO (`YYYY-MM-DD`, Asia/Tehran calendar). `exam` is an `ExamType.slug`; when the query
parameter is absent the API reads the storefront's «آزمون من» `exam` cookie (same-origin calls send it).

### د۱ Ownership: `GET /me/owned/` (auth)

```json
{ "books": [
  { "book_id": 12, "slug": "حقوق-مدنی", "title": "حقوق مدنی", "formats": ["PRINT", "EBOOK"],
    "can_read": true, "purchased_at": "2026-10-02T18:00:00Z", "order_number": "DR-14050712-0001" }
] }
```

* `PRINT`: a PRINT or BUNDLE line of a paid order (PAID, PROCESSING, SHIPPED, DELIVERED) not fully
  refunded through a return. `EBOOK`: an active ebook entitlement (purchase or admin grant).
* `purchased_at` / `order_number`: the latest print purchase, else the entitlement grant.
* 401 for visitors. `Cache-Control: private, no-store`. The storefront fetches it in the browser once
  per page (product banner, kit, cart, added-to-cart sheet) so catalog HTML stays the same for everyone.

### د۲ Delivery date promise

`ShippingMethod` gained `min_business_days`, `max_business_days` (null = no estimate; max null = min)
and `cutoff_hour` (0–23, Tehran time). `ShippingHoliday` (admin «تعطیلات ارسال», Jalali date input)
lists official holidays. Rules (`apps.orders.services.delivery`):

* business day = not Friday and not a `ShippingHoliday`;
* dispatch = today when paid on a business day before `cutoff_hour`, else the next business day;
* window = dispatch + min … + max business days (0 = the dispatch day);
* exam clash = `max_date` > next exam date − 7 days.

`DeliveryEstimate`: `{ "dispatch_date", "min_date", "max_date", "label": "شنبه ۱۸ مهر تا دوشنبه ۲۰ مهر" }`
`ExamClash`: `{ "exam_name", "exam_date", "safe_until", "message" }`

* `GET /shipping-methods/?province=&subtotal=&exam=` — each `ShippingOption` also has
  `delivery_estimate` (`DeliveryEstimate | null`) and `exam_clash` (`ExamClash | null`). The quote's
  `shipping` option carries `delivery_estimate` too (its `exam_clash` is always null).
* `GET /delivery-estimate/?province=&exam=` (public, `Cache-Control: private, max-age=300`):

```json
{ "estimate": DeliveryEstimate | null,
  "methods": [{ "id": 1, "code": "post", "name": "پست پیشتاز", "tehran_only": false,
                "estimate": DeliveryEstimate | null, "exam_clash": ExamClash | null }],
  "exam": { "name": "آزمون کانون ۱۴۰۵", "slug": "kanoon", "date": "2026-10-15", "days_left": 10,
            "safe_until": "2026-10-08" } | null,
  "exam_clash": ExamClash | null }
```

  Without `province` only nationwide methods are used (no courier promise to other cities); `estimate`
  spans the earliest `min_date` to the latest `max_date` of the offered methods.
* `GET /orders/<number>/` — `delivery_estimate` for a paid order that needs shipping and is not yet
  delivered (computed from `paid_at`), else null.

### د۳ Post-purchase «شروع مطالعه» (auth, own paid orders only; 404 otherwise)

* `GET /me/orders/<number>/start/?exam=`

```json
{ "order": "DR-…",
  "read_first": { "id": 12, "slug": "…", "title": "…", "cover": null, "subject_color": "#1F4E8C",
                  "reader_url": "/read/…", "percent_read": 0.0 } | null,
  "exam": ExamInfo | null,
  "plan": { "exam_type": "kanoon", "books": [{ "slug": "…", "title": "…" }], "subjects": ["…"] },
  "reminders": { "sms": false, "consented_at": null } }
```

  `read_first`: a readable ebook of the order that is **essential** in the exam's kit (heaviest
  subject first, then kit order), else the order's first readable ebook; null for print-only orders.
  `ExamInfo`: `{ "slug", "name", "event_name", "date", "days_left" }` (exam from `?exam=`/cookie, else
  the exam most of the order's books belong to).
* `POST /me/study-plan/` `{ "order": "DR-…", "exam_type"?: "kanoon", "hours_per_day"?: 6 }` →
  201 `{ "token", "plan_url": "/plan/<token>" }`. Uses the existing study-plan generator (`apps.leads`)
  with the customer's phone, the order's books and their subjects. The lead's `consent` mirrors the
  SMS-reminder flag (never assumed). Throttle scope `study_plan`.
* `GET /me/study-reminders/` → `{ "sms": bool, "consented_at": iso | null }`;
  `PUT /me/study-reminders/` `{ "sms": bool, "source"?: "payment_result" | "account" }` → same shape.
  Stored in `studyhub.StudyReminderConsent` (one row per user, with opt-in and withdrawal times).
  Sending reminders is not built yet.

### د۴ Readiness dashboard (auth)

* `GET /me/readiness/?exam=` (exam from the param/cookie, else the customer's last paid order)

```json
{ "exam": ExamInfo | null,
  "subjects": [
    { "subject": { "id": 1, "name": "حقوق مدنی", "slug": "…", "color": "#1F4E8C" }, "weight": 4,
      "essential_total": 2, "essential_owned": 1, "ready": false, "percent_read": 40.0,
      "books": [
        { "id": 12, "slug": "…", "title": "…", "cover": null, "subject_color": "#1F4E8C",
          "owned": true, "formats": ["EBOOK"], "percent_read": 40.0, "buy_variant": null },
        { "id": 13, "…": "…", "owned": false, "formats": [], "percent_read": null,
          "buy_variant": { "id": 31, "type": "PRINT", "type_label": "نسخه چاپی", "price": 450000 } } ] } ],
  "ready_subjects": 1, "total_subjects": 2, "headline": "آمادگی منابع: ۱ از ۲ درس" }
```

  Subjects: the exam's active kit recommendations that have essential books, by weight then subject
  order. A subject is `ready` when every essential book is owned (any format). `percent_read` averages
  the subject's owned ebooks (`ReadingProgress`); null when none (print reading isn't tracked).
  `buy_variant` follows the kit default (bundle → print → ebook, purchasable only).
* `GET /me/back-in-stock/` → `[{ "id", "status": "PENDING" | "NOTIFIED", "status_label", "created_at",
  "notified_at", "book": { "id", "slug", "title", "cover", "subject_color" },
  "variant": { "id", "type", "type_label", "in_stock" } }]` — requests linked to the user or made with
  their phone; pending ones plus those notified in the last 30 days.
* `DELETE /me/back-in-stock/<id>/` → 204 (pending → CANCELLED); 404 when not theirs or not pending.
