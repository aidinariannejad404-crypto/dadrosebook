import { format as formatJalali, differenceInCalendarDays } from "date-fns-jalali";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** U+066C ARABIC THOUSANDS SEPARATOR */
export const THOUSANDS_SEPARATOR = "٬";

/** Replace ASCII (and Arabic-Indic) digits with Persian digits. */
export function toPersianDigits(input: string | number): string {
  return String(input)
    .replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d)
    .replace(/[٠-٩]/g, (d) => PERSIAN_DIGITS[d.charCodeAt(0) - 0x0660] ?? d);
}

/** 2200000 → "۲٬۲۰۰٬۰۰۰" */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  return sign + toPersianDigits(grouped);
}

/** 2200000 → "۲٬۲۰۰٬۰۰۰ تومان" */
export function formatToman(n: number): string {
  return `${formatNumber(n)} تومان`;
}

/** Parse "YYYY-MM-DD" as a local calendar date (avoids UTC off-by-one). */
export function parseIsoDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** "2026-11-05" → "۱۴ آبان ۱۴۰۵" */
export function formatJalaliDate(value: string | Date, pattern = "d MMMM yyyy"): string {
  return toPersianDigits(formatJalali(parseIsoDate(value), pattern));
}

/** Whole calendar days from `now` until `target` (0 on the day itself, negative when past). */
export function daysUntil(target: string | Date, now: Date = new Date()): number {
  return differenceInCalendarDays(parseIsoDate(target), now);
}

/** Simple percent with Persian digits: 15 → "۱۵٪" */
export function formatPercent(n: number): string {
  return `${toPersianDigits(Math.round(n))}٪`;
}
