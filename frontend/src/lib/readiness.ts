/**
 * د۴ readiness dashboard (/account/readiness): pure presentation rules.
 */
import { toPersianDigits } from "./format";
import type { ExamInfo, ReadinessSubject } from "./trust-types";

export type Tone = "success" | "warning" | "neutral";

/** «۲ از ۳ منبع ضروری» + tone: all owned → success, some → warning, none → neutral. */
export function subjectStatus(s: Pick<ReadinessSubject, "essential_owned" | "essential_total" | "ready">): { text: string; tone: Tone } {
  const text = `${toPersianDigits(s.essential_owned)} از ${toPersianDigits(s.essential_total)} منبع ضروری`;
  if (s.ready) return { text, tone: "success" };
  return { text, tone: s.essential_owned > 0 ? "warning" : "neutral" };
}

/** Rounded whole percent, clamped to 0–100. */
export function percentValue(p: number | null | undefined): number {
  if (p == null || Number.isNaN(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** «۴۰٪ خوانده‌شده» / «هنوز شروع نکرده‌اید» / null when reading isn't tracked (print only). */
export function readText(p: number | null | undefined): string | null {
  if (p == null) return null;
  const v = percentValue(p);
  return v === 0 ? "هنوز شروع نکرده‌اید" : `${toPersianDigits(v)}٪ خوانده‌شده`;
}

/** «۴۰ روز تا آزمون کانون ۱۴۰۵» (null when there's no upcoming date). */
export function daysLeftText(exam: ExamInfo | null): string | null {
  if (!exam || exam.days_left == null || exam.days_left < 0) return null;
  const name = exam.event_name ?? exam.name;
  return exam.days_left === 0 ? `${name} امروز است` : `${toPersianDigits(exam.days_left)} روز تا ${name}`;
}

/** Headline progress 0–100 for the ring/bar. */
export function readinessPercent(ready: number, total: number): number {
  return total > 0 ? Math.round((ready / total) * 100) : 0;
}

/** Missing essential books with a purchasable variant (for «افزودن همه کتاب‌های لازم»). */
export function missingVariantIds(subjects: ReadinessSubject[]): number[] {
  const ids = new Set<number>();
  for (const s of subjects) for (const b of s.books) if (!b.owned && b.buy_variant) ids.add(b.buy_variant.id);
  return [...ids];
}
