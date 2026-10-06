# Package ب — SEO content hubs (impl/hubs)

Source: `ux-seo-research/report.md` (بسته ب) and `appendix/seo-google.md` §5.

## Built

| Item | What | Where |
|---|---|---|
| ب۱ | Exam hub `/exam/<slug>`: editorial intro + byline/date, countdown to the next ExamEvent, essential-kit CTA (`/kit?exam=`), books grouped by subject (ordered by ضریب, kit essentials first, max 12 per subject + «همه کتاب‌ها»), academy courses, guides, CollectionPage + BreadcrumbList JSON-LD | `frontend/src/app/exam/[slug]`, `GET /api/v1/content/exams/<slug>/` |
| — | The «آزمون من» cookie POST moved from `/exam` to `/exam/select`; `/exam` still accepts the POST (cached pages) and redirects GET home | `app/exam/select/route.ts`, `app/exam/route.ts`, `ExamChips` |
| ب۲ | Subject hub `/subject/<slug>`: intro, books, exams (→ exam hubs), top authors, courses, guides. `SubjectTag`, home subject tiles, the mobile «دسته‌ها» sheet, the mega menu and search autocomplete now link here instead of the noindexed `/search?subject=` | `app/subject/[slug]`, `GET /content/subjects/<slug>/` |
| ب۳ | Author/translator page `/author/<slug>`: photo, job title, affiliation, bio, official links, authored + translated books, subjects; ProfilePage › Person JSON-LD (jobTitle, affiliation, sameAs, workExample). Author names link here on the product page, on every book card (44px hit area above the stretched card link) and from search autocomplete. New Person fields: `job_title`, `affiliation`, `same_as` | `app/author/[slug]`, `GET /content/authors/<slug>/` |
| ب۴ | Publisher page `/publisher/<slug>`, linked from the product page facts | `app/publisher/[slug]`, `GET /content/publishers/<slug>/` |
| ب۵ | `Guide` model (apps.content) + Persian unfold admin (WYSIWYG, Jalali «تاریخ به‌روزرسانی», preview link) + API + `/guide/<slug>` with Article JSON-LD and byline «نوشته … · بازبینی …» linking to the people's pages. Drafts are visible only with `?preview=<preview_key>` (noindex, never cached). One demo guide is seeded as **DRAFT** | `app/guide/[slug]`, `GET /content/guides/`, `GET /content/guides/<slug>/` |
| ب۶ | `CuratedList` + ordered items with notes, optional end date; `/list/<slug>` with share button; expired lists stay reachable with a notice and noindex. One demo list seeded | `app/list/[slug]`, `GET /content/lists/<slug>/` |
| ب۷ | Guardrail `apps/content/services/indexing.py`: exam/subject/list hubs need an intro ≥ `HUB_INDEX_MIN_INTRO_WORDS` (150) words that is not marked placeholder **and** ≥ `HUB_INDEX_MIN_BOOKS` (3) active books; authors need ≥1 book and a bio (≥25 words) or ≥ `AUTHOR_INDEX_MIN_BOOKS` (2) books; publishers ≥ `PUBLISHER_INDEX_MIN_BOOKS` (3). Otherwise `noindex, follow` and left out of the sitemap. The admin shows «وضعیت ایندکس صفحه» with the missing requirements on exam/subject/person/publisher pages | settings in `config/settings/base.py` (env-overridable) |
| Sitemap | `/sitemap.xml` is now a sitemap index of `/sitemap-pages.xml` (home, kit, policy pages), `/sitemap-books.xml`, `/sitemap-hubs.xml` (categories + indexable hubs), `/sitemap-content.xml` (guides, lists). No priority/changefreq. `GET /seo/sitemap/` returns only indexable `exam_types`/`subjects` plus new `authors`, `publishers`, `guides`, `lists` | `lib/sitemap.ts`, `app/sitemap*.xml/route.ts`, `apps/content/services/sitemap.py` |
| Nav | Footer column «منابع آزمون‌ها» (exam hubs), mega menu exam headings → exam hubs + a «صفحه هر درس» row, category sheet chips → hubs | `Footer.tsx`, `MegaMenu.tsx`, `CategorySheet.tsx` |
| Analytics | `hub_cta_click` (`trackHubCtaClick`) | `lib/analytics.ts`, `docs/analytics.md` |

Seed: `manage.py seed_hubs` (also run by `seed_catalog`; idempotent, never overwrites admin edits).

## Placeholder text — to be replaced by the academy

The five exam intros in `backend/apps/content/seed_hubs.py` are **placeholder text** written so the
pages look real in development. They are saved with «مقدمه موقت است» ticked, which keeps the exam
hubs `noindex` and out of the sitemap. The academy should rewrite each intro in the admin
(آزمون‌ها › صفحه اختصاصی در سایت) and untick the box. The demo guide «بهترین منابع آزمون وکالت ۱۴۰۵
(نمونه پیش‌نویس)» and the demo list «سریع‌خوان‌های ماه آخر» are samples too.

## Decisions for the owner

1. The extra «مقدمه موقت است» flag goes beyond the brief's rule (intro length + books): it stops
   seeded sample text from being indexed. Keep it?
2. Subjects, publishers and authors have no intros/bios yet: subject hubs stay noindex until each
   gets a ~150-word intro; authors with ≥2 books and publishers with ≥3 books are indexable already
   (on the seed data: 11 authors, 6 publishers).
3. Exam × subject pages (`/exam/<exam>/<subject>`) were not built; the per-subject «همه کتاب‌ها»
   link still goes to the (noindexed) search page.

## Skipped / notes

- Fixture mode (`USE_API_FIXTURES=1`) has no hub data: the hub pages 404 there.
- Guides and lists have no index pages yet (`/guide`, `/list`); they are linked from hubs and the sitemap.
- Screenshots: `/mnt/project-files/dadrose-book/screenshots/ux-seo-impl/hubs-{exam,subject,author,publisher,guide,list}-{360,desktop}.png`.
