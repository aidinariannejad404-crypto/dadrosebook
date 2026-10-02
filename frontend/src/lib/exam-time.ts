import type { ExamEvent } from "./types";

/** Exams are held in Iran: whole calendar days are counted in Tehran time (UTC+03:30, no DST). */
const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** P1-9: the quick-review rail moves above bestsellers when the exam is at most this many days away. */
export const QUICK_REVIEW_FIRST_DAYS = 45;
/** P1-6: under this many days, offer the ebook as the "start reading now" option. */
export const LOW_TIME_DAYS = 14;

/** Today's date in Tehran as "YYYY-MM-DD". */
export function tehranToday(now: number): string {
  return new Date(now + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Whole days left until the exam starts (00:00 Tehran on the exam date) — the same number the
 * homepage countdown bar shows («۳۳ روز ۴ ساعت» → 33). Negative once the exam has started, null if invalid.
 */
export function daysLeft(isoDate: string | null | undefined, now: number): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const target = Date.parse(`${isoDate}T00:00:00Z`) - TEHRAN_OFFSET_MS;
  if (!Number.isFinite(target)) return null;
  return Math.floor((target - now) / DAY_MS);
}

/** P1-9: true when the next exam is 1..45 days away. */
export function quickReviewFirst(nextExamDate: string | null | undefined, now: number): boolean {
  const d = daysLeft(nextExamDate, now);
  return d != null && d > 0 && d <= QUICK_REVIEW_FIRST_DAYS;
}

/**
 * The exam a product page counts down to: the visitor's selected exam first, then the earliest
 * exam the book is meant for. Past events are ignored. Events arrive sorted ascending.
 */
export function pickExamEvent(
  events: ExamEvent[],
  selectedSlug: string | null | undefined,
  bookExamSlugs: string[],
  now: number,
): ExamEvent | null {
  const upcoming = events.filter((e) => (daysLeft(e.date, now) ?? -1) > 0);
  if (selectedSlug) {
    const sel = upcoming.find((e) => e.exam_type.slug === selectedSlug);
    if (sel) return sel;
  }
  return upcoming.find((e) => bookExamSlugs.includes(e.exam_type.slug)) ?? null;
}

/** P1-6: show «زمان کم است؟…» when fewer than 14 days remain. */
export function isLowTime(days: number | null): boolean {
  return days != null && days > 0 && days < LOW_TIME_DAYS;
}

/** P1-16: soft warning when the suggested study time is longer than the days left (not for quick-review books). */
export function needsQuickReviewHint(studyDays: number | null, days: number | null, isQuickReview: boolean): boolean {
  return !isQuickReview && studyDays != null && days != null && days > 0 && studyDays > days;
}
