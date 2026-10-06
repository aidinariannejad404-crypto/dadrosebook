/**
 * د۱ «این کتاب را دارید»: what the logged-in customer already owns (GET /me/owned/).
 *
 * Fetched in the browser only (once per page load, shared by every component), so product, kit and
 * cart pages stay identical (and cacheable) for everyone; logged-out visitors get a 401 and see
 * nothing. Pure helpers below decide what to say for a book / format.
 */
import { formatJalaliDay } from "./order-status";
import { apiFetch } from "./session";
import type { OwnedBook } from "./trust-types";
import type { VariantType } from "./types";

export type OwnedMap = Map<number, OwnedBook>;

export function ownedMap(rows: OwnedBook[]): OwnedMap {
  return new Map(rows.map((r) => [r.book_id, r]));
}

export const ownsEbook = (o: OwnedBook | undefined): boolean => Boolean(o?.formats.includes("EBOOK"));
export const ownsPrint = (o: OwnedBook | undefined): boolean => Boolean(o?.formats.includes("PRINT"));

/** «۱۲ مهر ۱۴۰۵» */
export function purchasedOn(o: OwnedBook): string | null {
  return o.purchased_at ? formatJalaliDay(o.purchased_at) : null;
}

export type OwnedBanner =
  | { kind: "read"; text: string; action: string }
  | { kind: "bought"; text: string; action: string | null };

/** Product page banner: ebook owners continue reading; print owners see when they bought it. */
export function ownedBanner(o: OwnedBook | undefined): OwnedBanner | null {
  if (!o || o.formats.length === 0) return null;
  if (ownsEbook(o) && o.can_read) return { kind: "read", text: "در کتابخانه شما", action: "ادامه مطالعه" };
  const day = purchasedOn(o);
  return {
    kind: "bought",
    text: day ? `این کتاب را در ${day} خریدید` : "این کتاب را قبلاً خریده‌اید",
    action: o.order_number ? "مشاهده سفارش" : null,
  };
}

/**
 * Warning before / after adding `type` of a book the customer owns. Buying the print copy of an
 * ebook they own is normal (no warning); repeating a format is worth a gentle check.
 */
export function duplicateWarning(o: OwnedBook | undefined, type: VariantType): string | null {
  if (!o) return null;
  if (type === "EBOOK" && ownsEbook(o)) return "نسخه الکترونیک این کتاب در کتابخانه شما هست؛ نیازی به خرید دوباره نیست.";
  if (type === "BUNDLE" && ownsEbook(o))
    return "نسخه الکترونیک این کتاب را دارید؛ اگر فقط نسخه چاپی می‌خواهید، «چاپی» را انتخاب کنید.";
  if ((type === "PRINT" || type === "BUNDLE") && ownsPrint(o)) {
    const day = purchasedOn(o);
    return day ? `نسخه چاپی این کتاب را در ${day} خریده‌اید.` : "نسخه چاپی این کتاب را قبلاً خریده‌اید.";
  }
  return null;
}

/** Short badge for kit rows and readiness lists. */
export function ownedBadge(o: OwnedBook | undefined): string | null {
  if (!o) return null;
  return ownsEbook(o) ? "در کتابخانه شما" : "خریده‌اید";
}

/** Kit: book ids to leave out of «افزودن همه» (the customer owns them in any format). */
export function ownedIdsIn(bookIds: number[], owned: OwnedMap): number[] {
  return bookIds.filter((id) => owned.has(id));
}

// ---- browser loader (one request per page load) ----

export type OwnedState = { kind: "user"; books: OwnedMap } | { kind: "anonymous" } | { kind: "error" };

let ownedPromise: Promise<OwnedState> | null = null;

export function loadOwned(): Promise<OwnedState> {
  ownedPromise ??= apiFetch<{ books: OwnedBook[] }>("/me/owned/").then((r): OwnedState => {
    if (r.ok && Array.isArray(r.data?.books)) return { kind: "user", books: ownedMap(r.data.books) };
    if (r.status === 401 || r.status === 403) return { kind: "anonymous" };
    ownedPromise = null; // transient failure: allow a retry
    return { kind: "error" };
  });
  return ownedPromise;
}

/** After a purchase or login the cached answer is stale. */
export function resetOwnedCache(): void {
  ownedPromise = null;
}

/** Kit: uncheck the owned books (formats are kept, so re-checking restores the choice). */
export function uncheckBooks<S extends { books: Record<number, boolean> }>(sel: S, ids: number[]): S {
  if (ids.length === 0) return sel;
  const books = { ...sel.books };
  for (const id of ids) books[id] = false;
  return { ...sel, books };
}
