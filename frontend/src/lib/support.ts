/** PF-11 support tickets: pure helpers. */
import { toAsciiDigits } from "./otp";
import type { TicketStatus } from "./platform-types";

export const TRACKING_CODE_LENGTH = 8;

export const SUPPORT_TOPICS: { value: string; label: string }[] = [
  { value: "order", label: "پیگیری سفارش و ارسال" },
  { value: "ebook", label: "کتاب الکترونیک و کتابخوان" },
  { value: "payment", label: "پرداخت" },
  { value: "return", label: "بازگشت کالا و استرداد" },
  { value: "account", label: "ورود و حساب کاربری" },
  { value: "book", label: "پرسش درباره کتاب و انتخاب منبع" },
  { value: "other", label: "سایر موارد" },
];

export const BODY_MIN = 10;

/** "۱۲۳۴ ۵۶۷۸" / "1234-5678" → "12345678" (digits only). */
export function cleanTrackingCode(input: string | null | undefined): string {
  return toAsciiDigits(input ?? "").replace(/\D/g, "").slice(0, TRACKING_CODE_LENGTH);
}

export function isTrackingCode(input: string): boolean {
  return /^\d{8}$/.test(input);
}

export function ticketTone(status: TicketStatus): "warning" | "success" | "neutral" {
  return status === "open" ? "warning" : status === "answered" ? "success" : "neutral";
}

export function isTopic(value: string | null | undefined): boolean {
  return !!value && SUPPORT_TOPICS.some((t) => t.value === value);
}
