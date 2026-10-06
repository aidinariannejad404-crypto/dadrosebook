import type { Course, CourseOffer, CourseType, PersonMini, TierCourse } from "./types";
import { formatNumber, toPersianDigits } from "./format";

/**
 * Course cross-sell helpers (docs/api-contract.md › «Course cross-sell and study-plan lead magnet»).
 * Pure functions: shared by server components and tests.
 */

export const COURSE_UTM = {
  utm_source: "dadrosebook",
  utm_medium: "referral",
  utm_campaign: "book_course",
} as const;

/** dadrose.com course link with the referral UTM; `content` is the book slug (or the placement). */
export function courseLink(url: string, content: string): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(COURSE_UTM)) u.searchParams.set(k, v);
    if (content) u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return url;
  }
}

const TIER_ORDER: Record<TierCourse["tier"], number> = { best: 0, better: 1, good: 2 };

/**
 * Tiers for display: best → better → good (price anchoring), at most 3, exactly one recommended when
 * possible — the first flagged by the API, else the first matching `recommended_type`.
 */
export function orderTiers(tiers: TierCourse[], recommendedType?: CourseType | null): TierCourse[] {
  const sorted = [...tiers].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]).slice(0, 3);
  let pick = sorted.findIndex((t) => t.is_recommended);
  if (pick === -1 && recommendedType) pick = sorted.findIndex((t) => t.course_type === recommendedType);
  return sorted.map((t, i) => ({ ...t, is_recommended: i === pick }));
}

/** «پیشنهاد ما برای ۳۳ روز مانده» when the exam is ahead, else «پیشنهاد ما». */
export function recommendedRibbon(daysLeft: number | null | undefined): string {
  return daysLeft != null && daysLeft > 0 ? `پیشنهاد ما برای ${toPersianDigits(daysLeft)} روز مانده` : "پیشنهاد ما";
}

/** «۳۰ ساعت · ۱۵ جلسه» (either part may be missing) or null. */
export function courseLength(c: Pick<Course, "hours" | "sessions">): string | null {
  const parts = [
    c.hours ? `${toPersianDigits(c.hours)} ساعت` : null,
    c.sessions ? `${toPersianDigits(c.sessions)} جلسه` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** «≈ ۹۹٬۳۳۳ تومان برای هر ساعت» or null (free / unknown hours). */
export function pricePerHourLabel(c: Pick<Course, "price_per_hour" | "is_free">): string | null {
  if (c.is_free || !c.price_per_hour) return null;
  return `هر ساعت ≈ ${formatNumber(c.price_per_hour)} تومان`;
}

export function hasCourseSale(c: Pick<Course, "price" | "effective_price" | "is_free">): boolean {
  return !c.is_free && c.effective_price < c.price;
}

/** Price after a percent code, rounded to the nearest 1,000 toman (display only). */
export function priceWithCode(price: number, percent: number | null | undefined): number | null {
  if (!percent || percent <= 0 || percent >= 100 || price <= 0) return null;
  return Math.round((price * (100 - percent)) / 100 / 1000) * 1000;
}

function personKey(name: string): string {
  return name
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/^(?:دکتر|استاد)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when one of the course teachers wrote the book (names compared loosely). */
export function taughtByAuthor(course: Pick<Course, "teachers">, authors: Pick<PersonMini, "name">[]): boolean {
  const names = new Set(authors.map((a) => personKey(a.name)));
  return course.teachers.some((t) => names.has(personKey(t)));
}

/** Nothing worth rendering in an offer (all parts empty). */
export function isEmptyOffer(offer: CourseOffer | null | undefined): boolean {
  if (!offer) return true;
  return !offer.highlight && offer.tiers.length === 0 && offer.more.length === 0 && !offer.free_sample && !offer.discount;
}
