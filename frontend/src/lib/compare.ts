/**
 * Compare 2-3 books (د۶). The tray (books picked from cards or a product page) lives in
 * localStorage; the page is `/compare?b=slug1,slug2,slug3` (noindex, shareable).
 */

export const COMPARE_KEY = "dadrose_compare";
export const COMPARE_MAX = 3;
export const COMPARE_MIN = 2;
export const COMPARE_EVENT = "dadrose:compare";

export interface CompareItem {
  id: number;
  slug: string;
  title: string;
}

/** Unicode slugs as produced by persian_slugify (same rule as the exam cookie). */
const SLUG_RE = /^[\p{L}\p{M}\p{N}_-]{1,120}$/u;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** `?b=a,b,c` (or repeated `?b=`) → up to 3 distinct valid slugs, in order. */
export function parseCompareParam(raw: string | string[] | undefined | null): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(","));
  const out: string[] = [];
  for (const p of parts) {
    const slug = decode(p).trim();
    if (slug && SLUG_RE.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= COMPARE_MAX) break;
  }
  return out;
}

export function compareHref(slugs: readonly string[]): string {
  const list = slugs.slice(0, COMPARE_MAX).map(encodeURIComponent).join(",");
  return list ? `/compare?b=${list}` : "/compare";
}

export function parseCompareItems(raw: string | null): CompareItem[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: CompareItem[] = [];
    for (const x of data) {
      if (!x || typeof x !== "object") continue;
      const { id, slug, title } = x as Partial<CompareItem>;
      if (typeof id === "number" && typeof slug === "string" && SLUG_RE.test(slug) && typeof title === "string") {
        if (!out.some((o) => o.id === id)) out.push({ id, slug, title });
      }
      if (out.length >= COMPARE_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Add/remove a book. Adding to a full tray is refused (`full: true`) rather than dropping one silently. */
export function toggleCompare(list: readonly CompareItem[], item: CompareItem, on: boolean): { list: CompareItem[]; full: boolean } {
  const rest = list.filter((x) => x.id !== item.id);
  if (!on) return { list: rest, full: false };
  if (rest.length >= COMPARE_MAX) return { list: [...list], full: true };
  return { list: [...rest, { id: item.id, slug: item.slug, title: item.title }], full: false };
}

/** Comparison rows: the cheapest effective price among purchasable variants of each type, for «کمترین». */
export function cheapestIndex(prices: readonly (number | null)[]): number | null {
  let best: number | null = null;
  prices.forEach((p, i) => {
    if (p != null && (best == null || p < (prices[best] as number))) best = i;
  });
  const distinct = new Set(prices.filter((p): p is number => p != null));
  return distinct.size > 1 ? best : null;
}
