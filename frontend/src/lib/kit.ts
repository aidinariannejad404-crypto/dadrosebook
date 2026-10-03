import type { StudyKit, StudyKitItem, Variant, VariantType } from "./types";

/**
 * Pure helpers for the study-kit builder (/kit). The kit is a list of StudyKit (one per subject);
 * the visitor picks subjects, books and one format per book, then adds everything with one bulk call.
 */

const FORMAT_ORDER: VariantType[] = ["PRINT", "EBOOK", "BUNDLE"];

/** Format choices for a book: every non-placeholder variant (sold-out ones are shown disabled). */
export function formatOptions(variants: Variant[]): Variant[] {
  return variants
    .filter((v) => !v.price_is_placeholder)
    .sort((a, b) => FORMAT_ORDER.indexOf(a.type) - FORMAT_ORDER.indexOf(b.type));
}

/** Default: BUNDLE if purchasable, else PRINT if in stock, else EBOOK (purchasable), else none. */
export function defaultFormat(variants: Variant[]): Variant | undefined {
  const ok = (type: VariantType) => variants.find((v) => v.type === type && !v.price_is_placeholder && v.in_stock);
  return ok("BUNDLE") ?? ok("PRINT") ?? ok("EBOOK");
}

/** Subjects by weight (ضریب) desc, unweighted last, otherwise keeping the API order. */
export function orderKits(kits: StudyKit[]): StudyKit[] {
  return kits
    .map((k, i) => ({ k, i }))
    .sort((a, b) => (b.k.weight ?? -1) - (a.k.weight ?? -1) || a.i - b.i)
    .map(({ k }) => k);
}

/** `s=` param → the subject slugs that exist in the kit (all of them when the param is absent/empty). */
export function parseSubjects(param: string | null | undefined, kits: StudyKit[]): string[] {
  const all = kits.map((k) => k.subject.slug);
  if (!param) return all;
  const wanted = new Set(param.split(",").map((s) => s.trim()).filter(Boolean));
  const picked = all.filter((s) => wanted.has(s));
  return picked.length ? picked : all;
}

export interface KitSelection {
  /** book id → included */
  books: Record<number, boolean>;
  /** book id → chosen variant id */
  formats: Record<number, number | undefined>;
}

/** Essential books with a purchasable format preselected, optional ones unchecked. */
export function initialSelection(kits: StudyKit[]): KitSelection {
  const books: Record<number, boolean> = {};
  const formats: Record<number, number | undefined> = {};
  for (const kit of kits) {
    for (const item of kit.items) {
      const id = item.book.id;
      const def = defaultFormat(item.book.variants);
      if (!(id in formats)) formats[id] = def?.id;
      books[id] = (books[id] ?? false) || (item.is_essential && def != null);
    }
  }
  return { books, formats };
}

export interface KitLine {
  item: StudyKitItem;
  variant: Variant;
}

/** The chosen lines for the selected subjects, one per book (a book listed under two subjects counts once). */
export function selectedLines(kits: StudyKit[], subjects: string[], sel: KitSelection): KitLine[] {
  const seen = new Set<number>();
  const lines: KitLine[] = [];
  for (const kit of kits) {
    if (!subjects.includes(kit.subject.slug)) continue;
    for (const item of kit.items) {
      const id = item.book.id;
      if (seen.has(id) || !sel.books[id]) continue;
      const variant = item.book.variants.find((v) => v.id === sel.formats[id]);
      if (!variant || variant.price_is_placeholder || !variant.in_stock) continue;
      seen.add(id);
      lines.push({ item, variant });
    }
  }
  return lines;
}

export interface KitTotals {
  books: number;
  total: number;
  original: number;
  savings: number;
}

/** Same arithmetic as the cart: effective prices, savings against list prices. */
export function kitTotals(lines: KitLine[]): KitTotals {
  const total = lines.reduce((s, l) => s + l.variant.effective_price, 0);
  const original = lines.reduce((s, l) => s + l.variant.price, 0);
  return { books: lines.length, total, original, savings: original - total };
}

/** `/kit?exam=<slug>&s=<subject,…>` — `s` is left out when every subject is selected. */
export function kitUrl(exam: string, subjects: string[], allSubjects: string[]): string {
  const all = allSubjects.length === subjects.length && allSubjects.every((s) => subjects.includes(s));
  const base = `/kit?exam=${encodeURIComponent(exam)}`;
  return !all && subjects.length ? `${base}&s=${subjects.map(encodeURIComponent).join(",")}` : base;
}
