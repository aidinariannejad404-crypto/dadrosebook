# UX quick wins (package ج + د۶) — summary

Source: `ux-seo-research/report.md` package ج and د۶; `appendix/jtbd-ux.md` R2, R9, R10, R12, R13, R16, R18, R20.

## Built
| Item | What | Where |
|---|---|---|
| ج۱ WebOTP | Login SMS is now an editable template (`core.SmsTemplate` key `otp_login`); `@<SITE_HOST> #<code>` is always appended in code (host falls back to the `FRONTEND_URL` host). `OtpLogin` calls `navigator.credentials.get({otp})` with an AbortController and submits the received code; typed/pasted full codes still auto-submit. | `accounts/sms.py`, `core/sms_catalog.py`, `lib/webotp.ts`, `components/auth/OtpLogin.tsx` |
| ج۲ Skeletons | `loading.tsx` for product, category, kit, cart and `account/*` with the real pages' grid geometry. | `components/skeletons/RouteSkeletons.tsx` |
| ج۳ Search zero state | On focus: recent searches (localStorage, max 5, deletable with ✕ or Delete), «پرطرفدار برای {آزمون}» and subject shortcuts from `GET /catalog/search/zero-state/?exam=`. No query log exists, so "popular" = best sellers of the exam. | `lib/recent-searches.ts`, `SearchAutocomplete.tsx`, `catalog/services/search_zero_state.py` |
| ج۴ Undo | Removing a cart line or a wishlist book leaves «… حذف شد · بازگرداندن» for 6 s (aria-live, focus moves to the button). | `lib/undo.ts`, `components/ui/UndoRow.tsx`, `CartView.tsx`, `WishlistGrid.tsx` |
| ج۵ Add to calendar | `ExamEvent.registration_start/end` (optional, Jalali admin fields); `GET /catalog/exam-events/<id>/calendar.ics?kind=exam|registration` (all-day, Persian text with Jalali dates, alarm 7 days / 1 day before); Google links in the exam-event API. Menu on the countdown bar and the kit page. | `catalog/services/exam_calendar.py`, `components/calendar/AddToCalendar.tsx` |
| ج۶ Guest wishlist | Hearts work without login (localStorage), `/wishlist` lists them; merged on login (`POST /wishlist/merge/`, called from OtpLogin, plus a fallback in the heart). `GET /wishlist/cards/?ids=` gives public cards. | `lib/guest-wishlist.ts`, `WishlistButton.tsx`, `wishlist/services/wishlist.py` |
| ج۷ Ebook facts | Ebook tile «X٪ ارزان‌تر»; when selected: «X٪ ارزان‌تر از نسخه چاپی», file format, pages, «مناسب موبایل» for EPUB. `BookDetail.ebook_formats`. | `lib/ebook-facts.ts`, `PurchasePanel.tsx` |
| ج۸ Motion | `--motion-fast/base/slow`, `--ease-out` (0 under reduced motion) mapped in Tailwind (`duration-fast`, `ease-out`); `.press` pressed state, cart badge bump on add, heart pop, kit «منابع ضروری در سبد» pulse + announcement. | `styles/tokens.css`, `globals.css`, `useBump.ts`, `KitBuilder.tsx` |
| د۶ Compare | Compare toggle on cards and the product page, floating tray (max 3), `/compare?b=a,b,c` (noindex): edition, up-to-date, pages, study days, exam fit, kit role, prices per format (cheapest marked), rating, sample. | `lib/compare.ts`, `components/compare/*`, `app/compare/page.tsx` |

Analytics events added: `search_zero_state_click`, `undo_remove`, `add_to_calendar`, `wishlist_toggle`, `compare_open`.

## Decisions for the owner
- Set `SITE_HOST=dadrosebook.com` in production (WebOTP only works when it equals the storefront host).
- Fill the registration window on each «تاریخ آزمون» in the admin; without it only the exam day is offered.
- Popular searches are best sellers until a search-query log is added.
