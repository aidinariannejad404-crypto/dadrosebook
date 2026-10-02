# Phase 1 API contract (`/api/v1/`)

Both the backend serializers and `frontend/src/lib/types.ts` must match this file exactly.
All money values are integer **toman**. Dates are ISO `YYYY-MM-DD` (Gregorian). Image/file URLs are
absolute (`request.build_absolute_uri`) or `null`. Slugs are Unicode Persian.

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
  "price_is_placeholder": false
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
  "min_price": 2200000,                  // lowest effective_price among active variants, null if none
  "formats": ["PRINT", "EBOOK", "BUNDLE"], // active variant types, in that order
  "in_stock": true,                      // any active variant in stock
  "print_in_stock": true,                // PRINT variant exists and stock > 0
  "is_quick_review": false,
  "volumes": 2
}
```

## Endpoints

### `GET /catalog/home/`
```jsonc
{
  "next_exam": { "id": 1, "name": "آزمون کانون وکلا ۱۴۰۵", "date": "2026-11-05", "exam_type": ExamTypeMini } | null,
  "exam_types": [ExamTypeMini],
  "subjects": [SubjectMini & { "book_count": 3 }],
  "categories": [CategoryNode],          // top-level categories with children (see below)
  "hero_banners": [Banner],
  "course_banners": [Banner],
  "bestsellers": [BookCard],             // up to 12, by sales_count desc
  "quick_review": [BookCard],            // up to 12, is_quick_review=true
  "featured_course": Course | null,      // first active course
  "guide_videos": [GuideVideo]           // up to 6
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
  "description": "<p>…</p>",      // sanitised HTML
  "table_of_contents": "…",       // plain text, newline separated
  "study_plan_note": "…",         // plain text
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
404 `{ "detail": "…" }` for unknown/inactive slug.

### `GET /catalog/books/<slug>/related/`
`[BookCard]`, up to 8, sharing a subject, excluding the book, by sales_count desc.

### Taxonomies
- `GET /catalog/subjects/` → `[SubjectMini & { "book_count": n }]` (no pagination)
- `GET /catalog/exam-types/` → `[ExamTypeMini]`
- `GET /catalog/categories/` → `[CategoryNode]` (tree from roots)
- `GET /catalog/categories/<slug>/` → `CategoryNode & { "description": "", "parent": {id,name,slug} | null }`
- `GET /catalog/exam-events/` → `[{ id, name, date, exam_type: ExamTypeMini }]` upcoming (date ≥ today), ascending
- `GET /catalog/study-kits/?exam_type=<slug>&subject=<slug,…>` →
  `[{ "exam_type": ExamTypeMini, "subject": SubjectMini, "note": "", "items": [{ "order": 1, "is_essential": true, "book": BookCard & {"variants": [Variant]} }] }]`

### `GET /health/` → `{ "status": "ok" }`
