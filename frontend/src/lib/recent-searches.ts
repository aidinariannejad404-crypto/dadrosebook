/**
 * «جستجوهای اخیر» (ج۳): the last few search terms of this browser, kept in localStorage.
 * Pure list helpers + a tiny storage wrapper; nothing leaves the device.
 */

export const RECENT_SEARCHES_KEY = "dadrose_recent_searches";
export const RECENT_SEARCHES_MAX = 5;
const MAX_TERM_LENGTH = 100;

/** Collapse whitespace and trim; "" for anything unusable. */
export function cleanTerm(term: unknown): string {
  return typeof term === "string" ? term.replace(/\s+/g, " ").trim().slice(0, MAX_TERM_LENGTH) : "";
}

/** Comparison key: Arabic ي/ك → Persian ی/ک, ZWNJ → space, case-folded (same term typed two ways = one entry). */
export function termKey(term: string): string {
  return cleanTerm(term.replace(/‌/g, " "))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();
}

/** Parse stored JSON defensively: malformed data gives []. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: string[] = [];
    for (const t of data) {
      const term = cleanTerm(t);
      if (term && !out.some((x) => termKey(x) === termKey(term))) out.push(term);
      if (out.length >= RECENT_SEARCHES_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Newest first, de-duplicated, at most RECENT_SEARCHES_MAX. Terms under 2 characters are ignored. */
export function pushRecent(list: string[], term: string): string[] {
  const t = cleanTerm(term);
  if (t.replace(/\s/g, "").length < 2) return list;
  return [t, ...list.filter((x) => termKey(x) !== termKey(t))].slice(0, RECENT_SEARCHES_MAX);
}

export function removeRecent(list: string[], term: string): string[] {
  return list.filter((x) => termKey(x) !== termKey(term));
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRecent(store: StorageLike | null = storage()): string[] {
  try {
    return parseRecent(store?.getItem(RECENT_SEARCHES_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeRecent(list: string[], store: StorageLike | null = storage()): void {
  try {
    if (list.length) store?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    else store?.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // storage full or blocked: recent searches are a convenience only
  }
}

/** Read → push → write; returns the new list. */
export function rememberSearch(term: string, store: StorageLike | null = storage()): string[] {
  const next = pushRecent(readRecent(store), term);
  writeRecent(next, store);
  return next;
}
