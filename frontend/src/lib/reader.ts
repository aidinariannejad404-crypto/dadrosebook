import { slugSegment } from "./api";
import { apiFetch } from "./session";
import type {
  FractionRect,
  Highlight,
  HighlightColor,
  HighlightCreate,
  ReaderSession,
  ReadingProgress,
} from "./types";

/**
 * Secure ebook reader client (Phase 4, docs/api-contract.md «Phase 4: secure ebook reader»).
 * Browser only: calls go same-origin through `apiFetch` (Phase 3 cookies) and are never cached.
 * NEXT_PUBLIC_READER_FIXTURE=1 (local dev/screenshots only) answers locally with
 * public/fixtures/reader-sample.pdf (6 pages) and in-memory highlights.
 */

export type ReaderError =
  | { kind: "auth" }
  | { kind: "forbidden" }
  | { kind: "no_ebook" }
  | { kind: "network" }
  | { kind: "http"; status: number };

export type ReaderResult<T> = { ok: true; data: T } | { ok: false; error: ReaderError };

export const HIGHLIGHT_COLORS: { value: HighlightColor; label: string; swatch: string }[] = [
  { value: "yellow", label: "زرد", swatch: "#f7d64a" },
  { value: "green", label: "سبز", swatch: "#7fd18b" },
  { value: "blue", label: "آبی", swatch: "#7db7f0" },
  { value: "pink", label: "صورتی", swatch: "#f29cc4" },
];

export const MAX_HIGHLIGHT_TEXT = 2000;
export const MAX_HIGHLIGHT_RECTS = 50;
/** Refresh the signed file URL this long before it expires. */
export const URL_REFRESH_MARGIN_MS = 30_000;
export const PROGRESS_SAVE_DELAY_MS = 1500;

export function readerFixtureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_READER_FIXTURE === "1";
}

/* ---------- pure helpers (unit-tested) ---------- */

/** Status code → typed error (401 auth, 403 forbidden, 404 no ebook). */
export function errorForStatus(status: number): ReaderError {
  if (status === 401) return { kind: "auth" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "no_ebook" };
  return { kind: "http", status };
}

/** Reading percent with two decimals (matches the server's `percent`). */
export function progressPercent(page: number, totalPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  const p = clampPage(page, totalPages);
  return Math.round((p / totalPages) * 10_000) / 100;
}

/** Whole page number within 1..total (1 when the input is not a number). */
export function clampPage(page: number, totalPages: number): number {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  if (!Number.isFinite(page)) return 1;
  return Math.min(total, Math.max(1, Math.round(page)));
}

/** "۳۷" / "37" / "٣٧" → 37; null when it is not a whole number. */
export function parsePageInput(value: string): number | null {
  const ascii = value
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!/^\d+$/.test(ascii)) return null;
  return Number(ascii);
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Client rects (e.g. Range.getClientRects()) → fractions of the page box, clipped to the page.
 * Empty rects and rects outside the page are dropped; at most MAX_HIGHLIGHT_RECTS are kept.
 */
export function rectsToFractions(rects: Iterable<RectLike>, page: RectLike): FractionRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  const out: FractionRect[] = [];
  for (const r of rects) {
    const x1 = clamp01((r.left - page.left) / page.width);
    const y1 = clamp01((r.top - page.top) / page.height);
    const x2 = clamp01((r.left + r.width - page.left) / page.width);
    const y2 = clamp01((r.top + r.height - page.top) / page.height);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 0.0005 || h <= 0.0005) continue;
    out.push({ x: round4(x1), y: round4(y1), w: round4(w), h: round4(h) });
  }
  return out.slice(0, MAX_HIGHLIGHT_RECTS);
}

/** Fraction rect → pixel rect inside a page of the given size (the inverse of rectsToFractions). */
export function fractionToPixels(rect: FractionRect, width: number, height: number): RectLike {
  return { left: rect.x * width, top: rect.y * height, width: rect.w * width, height: rect.h * height };
}

/**
 * Merge rects that sit on the same line and touch/overlap horizontally (pdf.js emits one rect per
 * text span, so one selected line becomes many fragments). `tolerance` is in the rects' own units.
 */
export function mergeRects(rects: FractionRect[], tolerance = 0.004): FractionRect[] {
  const sameLine = (a: FractionRect, b: FractionRect) =>
    Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= Math.max(tolerance, Math.min(a.h, b.h) / 2);
  const touching = (a: FractionRect, b: FractionRect) =>
    b.x <= a.x + a.w + tolerance && b.x + b.w >= a.x - tolerance;
  const out: FractionRect[] = [];
  for (const r of rects) {
    let cur = { ...r };
    // absorb every existing rect this one joins (it may bridge two fragments)
    for (let i = out.length - 1; i >= 0; i--) {
      const o = out[i]!;
      if (sameLine(o, cur) && touching(o, cur)) {
        const x1 = Math.min(o.x, cur.x);
        const y1 = Math.min(o.y, cur.y);
        const x2 = Math.max(o.x + o.w, cur.x + cur.w);
        const y2 = Math.max(o.y + o.h, cur.y + cur.h);
        cur = { x: round4(x1), y: round4(y1), w: round4(x2 - x1), h: round4(y2 - y1) };
        out.splice(i, 1);
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Is the point (page fractions) inside any of the rects? Used to hit-test highlights on click. */
export function pointInRects(x: number, y: number, rects: FractionRect[]): boolean {
  return rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

/** True when the signed URL is expired or will be within `marginMs`. Unparseable → true. */
export function needsUrlRefresh(expiresAt: string, now: number = Date.now(), marginMs = URL_REFRESH_MARGIN_MS): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return now >= t - marginMs;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run the pending call now (no-op when nothing is pending). */
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
}

/** Trailing debounce with flush/cancel (progress saves). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const run = () => {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };
  const d = ((...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }) as Debounced<A>;
  d.flush = () => {
    if (timer) clearTimeout(timer);
    if (lastArgs) run();
    timer = null;
  };
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  d.pending = () => lastArgs !== null;
  return d;
}

/** Highlights grouped by page (ascending), each group in creation order. */
export function groupHighlightsByPage(items: Highlight[]): { page: number; items: Highlight[] }[] {
  const map = new Map<number, Highlight[]>();
  for (const h of [...items].sort((a, b) => a.page - b.page || a.created_at.localeCompare(b.created_at) || a.id - b.id)) {
    const list = map.get(h.page) ?? [];
    list.push(h);
    map.set(h.page, list);
  }
  return [...map.entries()].map(([page, list]) => ({ page, items: list }));
}

/* ---------- fixtures ---------- */

let fixtureHighlights: Highlight[] = [];
let fixtureProgress: ReadingProgress | null = null;
let fixtureNextId = 1;

function fixtureSession(slug: string): ReaderSession {
  return {
    book: { slug, title: "نمونه کتاب الکترونیک", subtitle: "", cover: null, authors: ["دادرُز"], subjects: [] },
    file: {
      format: "PDF",
      version: 1,
      url: "/fixtures/reader-sample.pdf",
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    },
    progress: fixtureProgress,
    watermark: "0912***4567 · ۱۴۰۵/۰۷/۱۰",
  };
}

/* ---------- HTTP ---------- */

/**
 * Same-origin `/api/v1/library/…` through the Phase 3 session helper: first-party httpOnly cookies,
 * one silent token refresh on 401, never cached.
 */
async function call<T>(path: string, init: RequestInit = {}): Promise<ReaderResult<T>> {
  const res = await apiFetch<T>(`/library${path}`, init);
  if (res.ok) return { ok: true, data: res.data };
  if (res.status === 0) return { ok: false, error: { kind: "network" } };
  return { ok: false, error: errorForStatus(res.status) };
}

const ok = <T>(data: T): ReaderResult<T> => ({ ok: true, data });

/** GET /library/<slug>/read/ — book, signed file URL, progress and watermark. */
export function getReaderSession(slug: string): Promise<ReaderResult<ReaderSession>> {
  if (readerFixtureEnabled()) return Promise.resolve(ok(fixtureSession(slug)));
  return call<ReaderSession>(`/${slugSegment(slug)}/read/`);
}

/** PUT /library/<slug>/progress/. `keepalive` lets the save finish while the tab is being hidden/closed. */
export function saveProgress(
  slug: string,
  body: { page: number; total_pages: number; location?: string },
  { keepalive = false } = {},
): Promise<ReaderResult<ReadingProgress>> {
  if (readerFixtureEnabled()) {
    fixtureProgress = {
      page: body.page,
      total_pages: body.total_pages,
      percent: progressPercent(body.page, body.total_pages),
      location: body.location ?? "",
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve(ok(fixtureProgress));
  }
  return call<ReadingProgress>(`/${slugSegment(slug)}/progress/`, {
    method: "PUT",
    body: JSON.stringify({ location: "", ...body }),
    keepalive,
  });
}

/** GET /library/<slug>/highlights/ (optionally one page). */
export function listHighlights(slug: string, page?: number): Promise<ReaderResult<Highlight[]>> {
  if (readerFixtureEnabled()) {
    return Promise.resolve(ok(fixtureHighlights.filter((h) => page === undefined || h.page === page)));
  }
  const qs = page === undefined ? "" : `?page=${page}`;
  return call<Highlight[]>(`/${slugSegment(slug)}/highlights/${qs}`);
}

export function createHighlight(slug: string, body: HighlightCreate): Promise<ReaderResult<Highlight>> {
  const clean: HighlightCreate = {
    ...body,
    text: body.text.slice(0, MAX_HIGHLIGHT_TEXT),
    note: (body.note ?? "").slice(0, MAX_HIGHLIGHT_TEXT),
    rects: body.rects.slice(0, MAX_HIGHLIGHT_RECTS),
  };
  if (readerFixtureEnabled()) {
    const now = new Date().toISOString();
    const h: Highlight = {
      id: fixtureNextId++,
      page: clean.page,
      text: clean.text,
      note: clean.note ?? "",
      color: clean.color ?? "yellow",
      rects: clean.rects,
      location: clean.location ?? "",
      created_at: now,
      updated_at: now,
    };
    fixtureHighlights = [...fixtureHighlights, h];
    return Promise.resolve(ok(h));
  }
  return call<Highlight>(`/${slugSegment(slug)}/highlights/`, { method: "POST", body: JSON.stringify(clean) });
}

export function updateHighlight(
  slug: string,
  id: number,
  body: { note?: string; color?: HighlightColor },
): Promise<ReaderResult<Highlight>> {
  const clean = { ...body, ...(body.note !== undefined ? { note: body.note.slice(0, MAX_HIGHLIGHT_TEXT) } : {}) };
  if (readerFixtureEnabled()) {
    const found = fixtureHighlights.find((h) => h.id === id);
    if (!found) return Promise.resolve({ ok: false, error: { kind: "http", status: 404 } });
    const updated = { ...found, ...clean, updated_at: new Date().toISOString() };
    fixtureHighlights = fixtureHighlights.map((h) => (h.id === id ? updated : h));
    return Promise.resolve(ok(updated));
  }
  return call<Highlight>(`/${slugSegment(slug)}/highlights/${id}/`, { method: "PATCH", body: JSON.stringify(clean) });
}

export function deleteHighlight(slug: string, id: number): Promise<ReaderResult<void>> {
  if (readerFixtureEnabled()) {
    fixtureHighlights = fixtureHighlights.filter((h) => h.id !== id);
    return Promise.resolve(ok(undefined));
  }
  return call<void>(`/${slugSegment(slug)}/highlights/${id}/`, { method: "DELETE" });
}
