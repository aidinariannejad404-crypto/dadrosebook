import { format as formatJalali } from "date-fns-jalali";
import type { OrderStatus } from "./account-types";
import { toPersianDigits } from "./format";

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "neutral";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال آماده‌سازی",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
  FAILED: "پرداخت ناموفق",
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PROCESSING: "info",
  SHIPPED: "primary",
  DELIVERED: "success",
  CANCELLED: "neutral",
  FAILED: "danger",
};

/** Colour tone of an order status pill (unknown statuses are neutral). */
export function orderStatusTone(status: string): Tone {
  return ORDER_TONES[status as OrderStatus] ?? "neutral";
}

/** Server label when present, else the local fallback, else the raw code. */
export function orderStatusLabel(status: string, serverLabel?: string | null): string {
  return serverLabel || ORDER_STATUS_LABELS[status as OrderStatus] || status;
}

/** Tailwind classes per tone (text/background pairs from tokens.css, all ≥ 4.5:1). */
export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  primary: "bg-primary-soft text-primary",
  neutral: "bg-neutral-soft text-ink",
};

export function isTerminalFailure(status: string): boolean {
  return status === "CANCELLED" || status === "FAILED";
}

/** The happy-path steps of an order; ebook-only orders skip preparation and shipping. */
export function orderSteps(needsShipping: boolean): OrderStatus[] {
  return needsShipping
    ? ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"]
    : ["PENDING_PAYMENT", "PAID", "DELIVERED"];
}

/** 0-based index of `status` on the happy path, -1 when off it (cancelled/failed/unknown). */
export function orderStepIndex(status: string, needsShipping = true): number {
  return orderSteps(needsShipping).indexOf(status as OrderStatus);
}

export type StepState = "done" | "current" | "upcoming" | "failed";

export interface TimelineStep {
  status: string;
  label: string;
  at: string | null;
  state: StepState;
}

/**
 * Vertical stepper rows: every logged change (oldest first) followed by the remaining happy-path
 * steps as "upcoming". The last logged entry is "current" (or "failed" for cancelled/failed);
 * DELIVERED is "done". No upcoming steps after a failure.
 */
export function timelineSteps(
  timeline: { status: string; label: string; at: string }[],
  status: string,
  needsShipping: boolean,
): TimelineStep[] {
  const logged = [...timeline].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows: TimelineStep[] = logged.map((t) => ({
    status: t.status,
    label: orderStatusLabel(t.status, t.label),
    at: t.at,
    state: "done",
  }));
  if (rows.length === 0) {
    rows.push({ status, label: orderStatusLabel(status), at: null, state: "done" });
  }
  const last = rows[rows.length - 1]!;
  if (isTerminalFailure(last.status)) {
    last.state = "failed";
    return rows;
  }
  if (last.status !== "DELIVERED") last.state = "current";
  const steps = orderSteps(needsShipping);
  const reached = Math.max(...rows.map((r) => steps.indexOf(r.status as OrderStatus)));
  for (const s of steps.slice(reached + 1)) {
    rows.push({ status: s, label: ORDER_STATUS_LABELS[s], at: null, state: "upcoming" });
  }
  return rows;
}

const TEHRAN_OFFSET_MINUTES = 210; // UTC+03:30, no DST since 2022

/** A Date whose *local* fields equal Tehran wall-clock time for `iso` (stable on any server TZ). */
export function tehranWallClock(iso: string | Date): Date {
  const ms = (iso instanceof Date ? iso.getTime() : Date.parse(iso)) + TEHRAN_OFFSET_MINUTES * 60_000;
  const t = new Date(ms);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes());
}

/** "2026-10-02T18:00:00Z" → "۱۰ مهر ۱۴۰۵" (Tehran calendar day). */
export function formatJalaliDay(iso: string | Date): string {
  return toPersianDigits(formatJalali(tehranWallClock(iso), "d MMMM yyyy"));
}

/** "2026-10-02T18:00:00Z" → "۱۰ مهر ۱۴۰۵، ساعت ۲۱:۳۰" (Tehran time). */
export function formatJalaliDateTime(iso: string | Date): string {
  return toPersianDigits(formatJalali(tehranWallClock(iso), "d MMMM yyyy، 'ساعت' HH:mm"));
}
