import type { PersonMini, SubjectMini } from "@/lib/types";

/**
 * «بازدیدهای اخیر»: a small per-browser list of product pages the visitor opened (localStorage).
 * Only what a cover tile needs is stored — never prices (they would go stale) and nothing personal.
 */

export const RECENTLY_VIEWED_KEY = "dadrose_recently_viewed";
export const RECENTLY_VIEWED_MAX = 12;

export interface ViewedBook {
  id: number;
  slug: string;
  title: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
  volumes: number;
}

function isViewedBook(x: unknown): x is ViewedBook {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<ViewedBook>;
  return (
    typeof b.id === "number" &&
    typeof b.slug === "string" &&
    b.slug.length > 0 &&
    typeof b.title === "string" &&
    (b.cover === null || typeof b.cover === "string") &&
    Array.isArray(b.subjects) &&
    Array.isArray(b.authors) &&
    typeof b.volumes === "number"
  );
}

/** Parse stored JSON defensively: anything malformed is dropped, never thrown. */
export function parseViewed(raw: string | null): ViewedBook[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isViewedBook).slice(0, RECENTLY_VIEWED_MAX) : [];
  } catch {
    return [];
  }
}

/** Most recent first, one entry per book, at most RECENTLY_VIEWED_MAX. */
export function pushViewed(list: ViewedBook[], book: ViewedBook): ViewedBook[] {
  const slim: ViewedBook = {
    id: book.id,
    slug: book.slug,
    title: book.title,
    cover: book.cover,
    subjects: book.subjects.slice(0, 1).map(({ id, name, slug, color }) => ({ id, name, slug, color })),
    authors: book.authors.slice(0, 2).map(({ id, name, slug }) => ({ id, name, slug })),
    volumes: book.volumes,
  };
  return [slim, ...list.filter((b) => b.id !== book.id)].slice(0, RECENTLY_VIEWED_MAX);
}

export function readViewed(): ViewedBook[] {
  try {
    return parseViewed(window.localStorage.getItem(RECENTLY_VIEWED_KEY));
  } catch {
    return [];
  }
}

export function rememberViewed(book: ViewedBook): void {
  try {
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(pushViewed(readViewed(), book)));
  } catch {
    // storage blocked or full: the rail simply stays empty
  }
}
