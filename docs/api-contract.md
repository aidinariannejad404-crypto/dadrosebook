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
  "course_badge": "دوره جامع حقوق مدنی ۱ تا ۸", // (P1-13) title of the first active related course, or null
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
