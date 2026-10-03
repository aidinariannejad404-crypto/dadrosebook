import type { ReviewSummary } from "./account-types";
import { toPersianDigits } from "./format";

export const RATING_LABELS: Record<number, string> = {
  1: "ضعیف",
  2: "متوسط",
  3: "خوب",
  4: "خیلی خوب",
  5: "عالی",
};

export interface DistributionRow {
  stars: 1 | 2 | 3 | 4 | 5;
  count: number;
  /** whole percent of all ratings; 0 when there are none */
  percent: number;
}

/** 5 → 1 rows with counts and percentages (of the sum of the distribution). */
export function distributionRows(summary: Pick<ReviewSummary, "distribution">): DistributionRow[] {
  const stars = [5, 4, 3, 2, 1] as const;
  const counts = stars.map((s) => Math.max(0, summary.distribution?.[String(s) as "1"] ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  return stars.map((s, i) => ({
    stars: s,
    count: counts[i]!,
    percent: total > 0 ? Math.round((counts[i]! / total) * 100) : 0,
  }));
}

/** 4.56 → "۴٫۶" (one decimal, Persian decimal separator). */
export function formatAverage(avg: number): string {
  return toPersianDigits(avg.toFixed(1).replace(/\.0$/, "")).replace(".", "٫");
}

export type StarFill = "full" | "half" | "empty";

/** Five star fills for an average, rounded to the nearest half. */
export function starFills(value: number): StarFill[] {
  const v = Math.round(Math.min(5, Math.max(0, value)) * 2) / 2;
  return [1, 2, 3, 4, 5].map((i) => (v >= i ? "full" : v >= i - 0.5 ? "half" : "empty"));
}

/** Accessible text for a rating: "امتیاز ۴٫۵ از ۵". */
export function ratingText(value: number): string {
  return `امتیاز ${formatAverage(value)} از ۵`;
}

/** First letter for the avatar bubble; "؟" for empty names. */
export function authorInitial(author: string): string {
  const ch = author.trim().replace(/^[‌\s.]+/, "")[0];
  return ch ?? "؟";
}

/** Display name for a review author (the API already abbreviates; empty → generic). */
export function authorName(author: string): string {
  return author.trim() || "کاربر دادرُز";
}

/** schema.org AggregateRating, only when there is a real average over ≥ 3 reviews. */
export function aggregateRating(summary: ReviewSummary | null | undefined): Record<string, unknown> | null {
  if (!summary || summary.average == null || summary.count < 3) return null;
  return {
    "@type": "AggregateRating",
    ratingValue: Math.round(summary.average * 10) / 10,
    reviewCount: summary.count,
    bestRating: 5,
    worstRating: 1,
  };
}

export const REVIEW_BODY_MAX = 2000;
