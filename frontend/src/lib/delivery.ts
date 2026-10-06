/**
 * د۲ delivery date promise in the browser. The backend computes the dates (Friday, holidays,
 * cutoff hour, Asia/Tehran); this module fetches them once per page load and holds the small pure
 * rules the UI needs (exam clash re-check for a chosen method, which formats are shipped).
 */
import { apiFetch } from "./session";
import type { DeliveryEstimate, DeliverySummary, ExamClash } from "./trust-types";
import type { VariantType } from "./types";

export const EXAM_MARGIN_DAYS = 7;

/** Only print copies travel: PRINT and BUNDLE. */
export const isShipped = (type: VariantType | undefined | null): boolean => type === "PRINT" || type === "BUNDLE";

/** «تحویل تقریبی: شنبه ۲۰ مهر تا دوشنبه ۲۲ مهر» */
export function promiseText(estimate: DeliveryEstimate | null | undefined): string | null {
  return estimate ? `تحویل تقریبی: ${estimate.label}` : null;
}

function isoDay(iso: string): number {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** True when the latest delivery date is after (exam date − 7 days); mirrors the backend rule. */
export function clashesWithExam(
  estimate: DeliveryEstimate | null | undefined,
  examDate: string | null | undefined,
  marginDays = EXAM_MARGIN_DAYS,
): boolean {
  if (!estimate || !examDate) return false;
  return isoDay(estimate.max_date) > isoDay(examDate) - marginDays * 86_400_000;
}

/** The clash for the selected method's estimate, built from the summary's exam (or null). */
export function clashFor(summary: DeliverySummary | null, estimate: DeliveryEstimate | null | undefined): ExamClash | null {
  const exam = summary?.exam;
  if (!exam || !clashesWithExam(estimate, exam.date)) return null;
  return summary?.exam_clash ?? {
    exam_name: exam.name,
    exam_date: exam.date,
    safe_until: exam.safe_until,
    message: `نسخه چاپی ممکن است کمتر از یک هفته پیش از ${exam.name} برسد؛ نسخه الکترونیک یا بسته را در نظر بگیرید.`,
  };
}

// ---- browser loader ----

let summaryPromise: Promise<DeliverySummary | null> | null = null;

/** GET /delivery-estimate/ (nationwide methods; the exam comes from the «آزمون من» cookie). */
export function loadDeliverySummary(): Promise<DeliverySummary | null> {
  summaryPromise ??= apiFetch<DeliverySummary>("/delivery-estimate/", { retry: false }).then((r) => {
    if (r.ok) return r.data;
    summaryPromise = null;
    return null;
  });
  return summaryPromise;
}
