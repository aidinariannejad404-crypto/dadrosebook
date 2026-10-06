# Retention stream (UX research ه۲، ه۳، ه۴، ه۵، ه۷)

New app `apps.study` (API under `/api/v1/study/`), frontend in `components/study/`, `lib/study.ts`.

| Item | Built |
|---|---|
| ه۳ minutes, goal, streak, کارنامه | Reader heartbeat (`POST /study/heartbeat/`, every 30 s, only while visible and active within 2 min; the server credits at most the time since the user's previous beat). `ReadingSession`, `BookReadingDay`, `ReadingDay` on Asia/Tehran days. Daily goal default 20 min (`GET/PATCH /study/goal/`). Streak = goal days in a chain; 2 free rest days per Persian week (Sat–Fri); today never breaks it. CSS-only celebration at goal / 7 / 30 days (static under reduced motion). `/account/report`: week chart, minutes per subject vs plan target, streak, finished books, goal editor. Dashboard block. |
| ه۴ time left | Pace from sessions (pages advanced ÷ active minutes; jumps ignored; default 2 min/page). Reader strip «حدود N دقیقه تا پایان فصل» (EPUB chapters; PDF outline, else end of book). Library cards «با سرعت فعلی، X روز پیش از آزمون تمام می‌شود» or a warning with the minutes a day needed (`GET /study/forecast/?exam_type=`). |
| ه۵ living plan | `StudyPlan`/`StudyPlanBook`. Link a `/plan/<token>` lead (same phone only) or build from owned books. «امروز» card with check-off; progress also from `ReadingProgress` (scaled to print pages); behind-schedule banner; «فشرده‌سازی» re-spreads unread pages to the exam (past days kept, marked «منتقل شد»). Token page unchanged and printable, plus «پیگیری روزانه در حساب من». |
| ه۲ edition upgrade | `EditionLink(new_book, old_book, upgrade_discount_percent)`. Owners (paid order line or active entitlement) of the old edition who don't own the new one get the percent off one unit of each new-edition line in the checkout quote (snapshotted into the order). Product banner «شما ویرایش ۱۴۰۴ را دارید؛ ارتقا با ۴۰٪ تخفیف». Admin action queues one SMS per owner (template `edition_upgrade`; `EditionUpgradeNotice` makes it idempotent). |
| ه۷ review loop | `ReviewPrompt` per user/book: 10 days after delivery (ebook-only orders are delivered at payment) or ≥ 90% read, last 60 days only, not if already reviewed. Celery beat `apps.study.tasks.review_prompts` (6-hourly, idempotent). Optional SMS (`REVIEW_PROMPT_SMS_ENABLED`, off by default; once per prompt, at most one a week per user, user opt-out). Dashboard card: one-tap stars, then optional text (existing reviews API). Product page: exam and star filter chips (`?exam_type=&rating=`), `summary.exam_types`. |

Dev demo: `manage.py seed_study_demo` (after `seed_catalog` and `seed_demo_ebooks`).

Owner decisions: default upgrade discount (40%); switch on review SMS or not; upgrade discount stacks
with discount codes today; the upgrade applies to every format of the new edition (one unit per line).
