/**
 * «آزمون من» (P1-3): the visitor's exam type slug, stored in the `exam` cookie for 180 days.
 * Pure helpers — used by the /exam route handler (writes) and server components (reads).
 */
export const EXAM_COOKIE = "exam";
export const EXAM_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

/** Unicode slugs as produced by persian_slugify: letters, marks, digits, "-" and "_"; at most 80 chars. */
const SLUG_RE = /^[\p{L}\p{M}\p{N}_-]{1,80}$/u;

/** Validate a raw cookie/form value (URL-encoded or not). Returns the decoded slug or null. */
export function parseExamSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  value = value.trim();
  return SLUG_RE.test(value) ? value : null;
}

/** Read the exam slug from a raw `Cookie:` request header. */
export function examSlugFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === EXAM_COOKIE) return parseExamSlug(part.slice(eq + 1));
  }
  return null;
}

/** `Set-Cookie` value that stores the slug (180 days, SameSite=Lax), or clears it when slug is null. */
export function examSetCookie(slug: string | null, secure = false): string {
  const attrs = ["Path=/", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
  if (!slug) return [`${EXAM_COOKIE}=`, "Max-Age=0", ...attrs].join("; ");
  return [`${EXAM_COOKIE}=${encodeURIComponent(slug)}`, `Max-Age=${EXAM_COOKIE_MAX_AGE}`, ...attrs].join("; ");
}
