/**
 * Pure helpers for phone + OTP login (Phase 3). Mirrors backend `apps/accounts/phone.py`:
 * the server re-validates everything, these only give instant feedback.
 */
import { toPersianDigits } from "./format";

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII. Other characters are kept. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Only the digits of `input` (any script), as ASCII. */
export function digitsOnly(input: string): string {
  return toAsciiDigits(input).replace(/\D/g, "");
}

/**
 * Like backend `normalize_phone`: "۰۹۱۲ ۰۰۰ ۰۰۰۰", "+989120000000", "00989120000000", "9120000000"
 * → "09120000000". Returns the cleaned digits even when they are not a valid mobile number.
 */
export function normalizePhone(value: string | null | undefined): string {
  let digits = digitsOnly(value ?? "");
  if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  return digits;
}

const PHONE_RE = /^09\d{9}$/;

/** Valid Iranian mobile in canonical form `09xxxxxxxxx`. */
export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value);
}

/** Same wording as the backend validator. */
export const PHONE_INVALID = "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.";

/** "09121234567" → "۰۹۱۲•••۴۵۶۷" (for the header chip and «کد به … ارسال شد»). */
export function maskPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.length < 8) return toPersianDigits(p);
  return toPersianDigits(`${p.slice(0, 4)}•••${p.slice(-4)}`);
}

/** Seconds → "۰۱:۰۵" (minutes:seconds, Persian digits). Negative → "۰۰:۰۰". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return toPersianDigits(`${mm}:${ss}`);
}

/** Clean an OTP code input: ASCII digits only, at most `length` of them. */
export function cleanCode(input: string, length: number): string {
  return digitsOnly(input).slice(0, Math.max(1, length));
}

/**
 * `?next=` sanitiser for redirects after login: only same-site relative paths ("/account",
 * "/checkout?variant=1"). Rejects absolute URLs, protocol-relative "//evil", backslash tricks,
 * control characters and the login page itself. Returns `fallback` otherwise.
 */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return fallback;
  return next;
}

/** "/login?next=<path>" (next sanitised; omitted when it is the default). */
export function loginHref(next?: string | null): string {
  const target = safeNext(next, "");
  return target ? `/login?next=${encodeURIComponent(target)}` : "/login";
}
