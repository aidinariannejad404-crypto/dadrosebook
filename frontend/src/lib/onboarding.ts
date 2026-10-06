/**
 * PF-8 onboarding sheet: pure helpers (the sheet itself is components/platform/OnboardingSheet).
 * After the first OTP login the login form sets a session flag; the sheet opens once on the next
 * page that is not checkout or the reader, and only while the API says `show_onboarding`.
 */
import { examSetCookie, parseExamSlug } from "./exam-cookie";
import { toPersianDigits } from "./format";
import type { StudyProfile, StudyProfileInput } from "./platform-types";

export const ONBOARDING_PENDING_KEY = "dadrose.onboarding.pending";

/** Pages where a sheet would get in the way (paying, reading). */
const BLOCKED_PREFIXES = ["/checkout", "/read", "/login"];

export function onboardingAllowedOn(pathname: string | null | undefined): boolean {
  const p = pathname || "/";
  return !BLOCKED_PREFIXES.some((b) => p === b || p.startsWith(`${b}/`));
}

let active = false;

/** True while the onboarding sheet is (about to be) open, so other one-time sheets wait. */
export function onboardingActive(): boolean {
  return active || takeOnboardingPending(true);
}

export function setOnboardingActive(value: boolean): void {
  active = value;
}

export function markOnboardingPending(): void {
  try {
    window.sessionStorage.setItem(ONBOARDING_PENDING_KEY, "1");
  } catch {
    /* storage blocked: the sheet stays reachable from the account */
  }
}

export function takeOnboardingPending(peek = false): boolean {
  try {
    const on = window.sessionStorage.getItem(ONBOARDING_PENDING_KEY) === "1";
    if (on && !peek) window.sessionStorage.removeItem(ONBOARDING_PENDING_KEY);
    return on;
  } catch {
    return false;
  }
}

/** Toggle `slug` in the weak-subject list, keeping at most `max` (the oldest pick drops out). */
export function toggleSubject(list: string[], slug: string, max = 3): string[] {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  const next = [...list, slug];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Initial form values: the saved profile, else the `exam` cookie's slug. */
export function initialProfileInput(profile: StudyProfile | null | undefined, cookieExam: string | null): StudyProfileInput {
  return {
    exam_type: profile?.exam_type ?? parseExamSlug(cookieExam),
    exam_year: profile?.exam_year ?? null,
    exam_date: profile?.exam_date ?? null,
    weak_subjects: profile?.weak_subjects ?? [],
  };
}

/** Read the `exam` cookie in the browser (not httpOnly). */
export function readExamCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq > -1 && part.slice(0, eq).trim() === "exam") return parseExamSlug(part.slice(eq + 1));
  }
  return null;
}

/** Keep the existing exam personalisation in sync with the saved profile (PF-8 → P1-3 cookie). */
export function syncExamCookie(slug: string | null | undefined): boolean {
  if (typeof document === "undefined" || !slug) return false;
  if (readExamCookie(document.cookie) === slug) return false;
  document.cookie = examSetCookie(slug, window.location.protocol === "https:");
  return true;
}

export function yearLabel(year: number): string {
  return toPersianDigits(year);
}
