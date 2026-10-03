import type { BookFacets, BookQuery } from "./types";

/**
 * URL ⇄ BookQuery for /category/<slug> and /search (pure functions, unit tested).
 * Page URLs use the API's own parameter names (q, subject, exam_type, format, resource_type,
 * min_price, max_price, in_stock, has_sample, quick_review, ordering, page); multi-value facets are
 * comma separated (repeated params are accepted too). Any filter change drops `page`.
 */

export type SearchParamsInput = Record<string, string | string[] | undefined> | URLSearchParams;

export type Ordering = NonNullable<BookQuery["ordering"]>;

export const ORDERINGS: { value: Ordering; label: string }[] = [
  { value: "-sales_count", label: "پرفروش‌ترین" },
  { value: "price", label: "ارزان‌ترین" },
  { value: "-price", label: "گران‌ترین" },
  { value: "-created_at", label: "جدیدترین" },
  { value: "title", label: "الفبا" },
];
export const DEFAULT_ORDERING: Ordering = "-sales_count";

export const PAGE_SIZE = 24;

/** Facets that hold several values. */
export type ListFacet = "subject" | "exam_type" | "format" | "resource_type";
/** Every filter key (everything except q, ordering, page, page_size, category). */
export type FilterKey = ListFacet | "min_price" | "max_price" | "in_stock" | "has_sample" | "quick_review";

const LIST_FACETS: ListFacet[] = ["subject", "exam_type", "format", "resource_type"];
const FORMATS = ["print", "ebook", "bundle"];
const RESOURCE_TYPES = ["TEXTBOOK", "TESTS", "LAWS", "QUICK_REVIEW", "COURSE_NOTES"];
const MAX_VALUES = 20;

function getAll(sp: SearchParamsInput, key: string): string[] {
  const raw = sp instanceof URLSearchParams ? sp.getAll(key) : ([] as string[]).concat(sp[key] ?? []);
  return raw.flatMap((v) => v.split(","));
}

function getOne(sp: SearchParamsInput, key: string): string | undefined {
  const v = sp instanceof URLSearchParams ? sp.get(key) : ([] as string[]).concat(sp[key] ?? [])[0];
  return v ?? undefined;
}

function list(sp: SearchParamsInput, key: string, normalise: (v: string) => string | null): string[] | undefined {
  const out: string[] = [];
  for (const raw of getAll(sp, key)) {
    const v = normalise(raw.trim());
    if (v && !out.includes(v)) out.push(v);
  }
  return out.length ? out.slice(0, MAX_VALUES) : undefined;
}

const slugValue = (v: string) => (v && v.length <= 80 && !/[\s/?#&]/.test(v) ? v : null);

/** Digits may arrive as Persian/Arabic-Indic (typed into the price inputs); separators are ignored. */
export function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const ascii = raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s,٬،]/g, "");
  if (!/^\d{1,10}$/.test(ascii)) return undefined;
  return Number(ascii);
}

function flag(sp: SearchParamsInput, key: string): true | undefined {
  const v = getOne(sp, key);
  return v === "true" || v === "1" || v === "on" ? true : undefined;
}

/** Parse page search params into a BookQuery (unknown or invalid values are dropped). */
export function parseBookQuery(sp: SearchParamsInput): BookQuery {
  const query: BookQuery = {};
  const q = getOne(sp, "q")?.replace(/\s+/g, " ").trim().slice(0, 100);
  if (q) query.q = q;
  const subject = list(sp, "subject", slugValue);
  if (subject) query.subject = subject;
  const exam = list(sp, "exam_type", slugValue);
  if (exam) query.exam_type = exam;
  const format = list(sp, "format", (v) => (FORMATS.includes(v.toLowerCase()) ? v.toLowerCase() : null));
  if (format) query.format = format;
  const rt = list(sp, "resource_type", (v) => (RESOURCE_TYPES.includes(v.toUpperCase()) ? v.toUpperCase() : null));
  if (rt) query.resource_type = rt;
  let min = parseAmount(getOne(sp, "min_price"));
  let max = parseAmount(getOne(sp, "max_price"));
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min) query.min_price = min;
  if (max !== undefined) query.max_price = max;
  if (flag(sp, "in_stock")) query.in_stock = true;
  if (flag(sp, "has_sample")) query.has_sample = true;
  if (flag(sp, "quick_review")) query.quick_review = true;
  const ordering = getOne(sp, "ordering");
  if (ordering && ordering !== DEFAULT_ORDERING && ORDERINGS.some((o) => o.value === ordering)) {
    query.ordering = ordering as Ordering;
  }
  const page = Number(getOne(sp, "page"));
  if (Number.isInteger(page) && page > 1 && page <= 1000) query.page = page;
  return query;
}

/** Page URL params for a query, in a stable order (category lives in the path, page_size is fixed). */
export function toSearchParams(query: BookQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  for (const key of LIST_FACETS) {
    const v = query[key];
    if (v?.length) sp.set(key, v.join(","));
  }
  if (query.min_price !== undefined) sp.set("min_price", String(query.min_price));
  if (query.max_price !== undefined) sp.set("max_price", String(query.max_price));
  if (query.in_stock) sp.set("in_stock", "true");
  if (query.has_sample) sp.set("has_sample", "true");
  if (query.quick_review) sp.set("quick_review", "true");
  if (query.ordering && query.ordering !== DEFAULT_ORDERING) sp.set("ordering", query.ordering);
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  return sp;
}

export function hrefFor(basePath: string, query: BookQuery): string {
  const qs = toSearchParams(query).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Drop the page whenever the result set changes. */
function fresh(query: BookQuery): BookQuery {
  const next = { ...query };
  delete next.page;
  return next;
}

export function isSelected(query: BookQuery, key: ListFacet, value: string): boolean {
  return query[key]?.includes(normaliseFacetValue(key, value)) ?? false;
}

/** Facet values from the API (PRINT, TEXTBOOK) in the form the URL keeps them. */
export function normaliseFacetValue(key: ListFacet, value: string): string {
  if (key === "format") return value.toLowerCase();
  if (key === "resource_type") return value.toUpperCase();
  return value;
}

/** Add the value when absent, remove it when present; resets the page. */
export function toggleFacet(query: BookQuery, key: ListFacet, value: string): BookQuery {
  const v = normaliseFacetValue(key, value);
  const current = query[key] ?? [];
  const values = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
  const next = fresh(query);
  if (values.length) next[key] = values;
  else delete next[key];
  return next;
}

export function toggleFlag(query: BookQuery, key: "in_stock" | "has_sample" | "quick_review"): BookQuery {
  const next = fresh(query);
  if (query[key]) delete next[key];
  else next[key] = true;
  return next;
}

/** Remove one filter (one value of a list facet when given). */
export function removeFilter(query: BookQuery, key: FilterKey, value?: string): BookQuery {
  if ((LIST_FACETS as string[]).includes(key) && value !== undefined) {
    const k = key as ListFacet;
    return isSelected(query, k, value) ? toggleFacet(query, k, value) : fresh(query);
  }
  const next = fresh(query);
  delete next[key];
  return next;
}

/** Keep only the search text and the ordering. */
export function clearFilters(query: BookQuery): BookQuery {
  const next: BookQuery = {};
  if (query.q) next.q = query.q;
  if (query.ordering) next.ordering = query.ordering;
  return next;
}

export function withOrdering(query: BookQuery, ordering: Ordering): BookQuery {
  const next = fresh(query);
  if (ordering === DEFAULT_ORDERING) delete next.ordering;
  else next.ordering = ordering;
  return next;
}

export function withPage(query: BookQuery, page: number): BookQuery {
  const next = { ...query };
  if (page > 1) next.page = page;
  else delete next.page;
  return next;
}

/** Number of active filters (each list value counts; a price range counts once). */
export function activeFilterCount(query: BookQuery): number {
  let n = 0;
  for (const key of LIST_FACETS) n += query[key]?.length ?? 0;
  if (query.min_price !== undefined || query.max_price !== undefined) n += 1;
  if (query.in_stock) n += 1;
  if (query.has_sample) n += 1;
  if (query.quick_review) n += 1;
  return n;
}

/** Any narrowing beyond page/ordering (used for robots noindex on category pages). */
export function isFiltered(query: BookQuery): boolean {
  return Boolean(query.q) || activeFilterCount(query) > 0;
}

export function totalPages(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/** Page numbers to show, with null for a gap: 1 … 4 5 6 … 12 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] ?? p) > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export interface ActiveChip {
  key: FilterKey;
  value?: string;
  label: string;
  color?: string;
  query: BookQuery;
}

const FORMAT_LABELS: Record<string, string> = { print: "نسخه چاپی", ebook: "نسخه الکترونیک", bundle: "چاپی + الکترونیک" };
const RESOURCE_LABELS: Record<string, string> = {
  TEXTBOOK: "درسنامه",
  TESTS: "تست",
  LAWS: "قانون",
  QUICK_REVIEW: "سریع‌خوان",
  COURSE_NOTES: "جزوه",
};

const slugLabel = (slug: string) => slug.replace(/-/g, " ");

/** Removable chips for the active filters, labelled from the facets when available. */
export function activeChips(query: BookQuery, facets: BookFacets | null, formatToman: (n: number) => string): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const slug of query.subject ?? []) {
    const f = facets?.subjects.find((s) => s.slug === slug);
    chips.push({ key: "subject", value: slug, label: f?.name ?? slugLabel(slug), color: f?.color, query: removeFilter(query, "subject", slug) });
  }
  for (const slug of query.exam_type ?? []) {
    const f = facets?.exam_types.find((s) => s.slug === slug);
    chips.push({ key: "exam_type", value: slug, label: f?.name ?? slugLabel(slug), query: removeFilter(query, "exam_type", slug) });
  }
  for (const v of query.format ?? []) {
    const f = facets?.formats.find((s) => s.value.toLowerCase() === v);
    chips.push({ key: "format", value: v, label: f?.label ?? FORMAT_LABELS[v] ?? v, query: removeFilter(query, "format", v) });
  }
  for (const v of query.resource_type ?? []) {
    const f = facets?.resource_types.find((s) => s.value === v);
    chips.push({ key: "resource_type", value: v, label: f?.label ?? RESOURCE_LABELS[v] ?? v, query: removeFilter(query, "resource_type", v) });
  }
  if (query.min_price !== undefined || query.max_price !== undefined) {
    const label =
      query.min_price !== undefined && query.max_price !== undefined
        ? `${formatToman(query.min_price)} تا ${formatToman(query.max_price)}`
        : query.min_price !== undefined
          ? `از ${formatToman(query.min_price)}`
          : `تا ${formatToman(query.max_price!)}`;
    const next = fresh(query);
    delete next.min_price;
    delete next.max_price;
    chips.push({ key: "min_price", label, query: next });
  }
  if (query.in_stock) chips.push({ key: "in_stock", label: "فقط موجود", query: removeFilter(query, "in_stock") });
  if (query.has_sample) chips.push({ key: "has_sample", label: "دارای نمونه صفحات", query: removeFilter(query, "has_sample") });
  if (query.quick_review) chips.push({ key: "quick_review", label: "سریع‌خوان", query: removeFilter(query, "quick_review") });
  return chips;
}

/**
 * Hidden inputs that carry the rest of the query through a GET form (sort select, price range).
 * `omit` lists the params the form itself provides; page is always dropped.
 */
export function hiddenFields(query: BookQuery, omit: string[]): [string, string][] {
  const sp = toSearchParams(fresh(query));
  return [...sp.entries()].filter(([k]) => !omit.includes(k));
}
