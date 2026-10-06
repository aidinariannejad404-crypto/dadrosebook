import { slugSegment } from "./api";
import { BROWSER_API, apiFetch, refreshSession } from "./session";
import type { ApiErrorBody } from "./session";
import { isDeviceId, searchChapterTexts, uuidFromBytes } from "./reader-epub";
import { EPUB_FIXTURE, EPUB_FIXTURE_SLUG, fixtureText } from "./reader-fixture-epub";
import type {
  Bookmark,
  CaptureEventKind,
  CopyQuota,
  CopyRecorded,
  EpubChapter,
  FractionRect,
  Highlight,
  HighlightColor,
  HighlightCreate,
  NotesExportFormat,
  OfflineGrant,
  OfflineLicense,
  ReaderDevice,
  ReaderSession,
  ReadingProgress,
  SearchResponse,
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
  | { kind: "device_limit"; devices: ReaderDevice[] }
  | { kind: "offline_limit"; licenses: OfflineLicense[] }
  | { kind: "throttled" }
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
  if (status === 429) return { kind: "throttled" };
  return { kind: "http", status };
}

/** Status + DRF body → typed error (Phase 6 adds 409 device_limit with the device list, 429). */
export function errorFromResponse(status: number, body: ApiErrorBody | null | undefined): ReaderError {
  if (status === 409 && body?.code === "device_limit") {
    const devices = Array.isArray(body.devices) ? (body.devices as ReaderDevice[]) : [];
    return { kind: "device_limit", devices };
  }
  if (status === 409 && body?.code === "offline_limit") {
    const licenses = Array.isArray(body.licenses) ? (body.licenses as OfflineLicense[]) : [];
    return { kind: "offline_limit", licenses };
  }
  return errorForStatus(status);
}

/* ---------- device id (X-Reader-Device) ---------- */

export const DEVICE_KEY = "dadrose.reader.device";
export const DEVICE_HEADER = "X-Reader-Device";
let deviceId: string | null = null;

function newDeviceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
    }
  } catch {
    /* fall through */
  }
  return uuidFromBytes(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
}

/** This browser's persistent reader device id (localStorage; per-visit when storage is blocked). */
export function readerDeviceId(): string {
  if (deviceId) return deviceId;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(DEVICE_KEY);
  } catch {
    stored = null;
  }
  if (isDeviceId(stored)) {
    deviceId = stored;
    return stored;
  }
  const id = newDeviceId();
  try {
    window.localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* storage unavailable */
  }
  deviceId = id;
  return id;
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

/**
 * Fixture mode answers locally, so «offline» is simulated: with the browser offline (e.g. Playwright
 * `context.setOffline(true)`) every fixture call fails like a network error.
 */
function fixtureDown(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
const NETWORK_DOWN = { ok: false, error: { kind: "network" } } as const;
const down = <T>(): Promise<ReaderResult<T>> => Promise.resolve(NETWORK_DOWN);

let fixtureHighlights: Highlight[] = [];
let fixtureBookmarks: Bookmark[] = [];
const fixtureProgressBySlug = new Map<string, ReadingProgress>();
let fixtureNextId = 1;

/** Fixture slug that answers 409 device_limit until one device is removed. */
export const DEVICE_LIMIT_FIXTURE_SLUG = "device-limit-sample";
/** The three other devices that fill the limit for DEVICE_LIMIT_FIXTURE_SLUG. */
let fixtureLimitDevices: ReaderDevice[] = [
  { id: 1, label: "Chrome · Android", last_seen: "2026-10-04T08:12:00Z", current: false },
  { id: 2, label: "Safari · iPhone", last_seen: "2026-09-28T19:40:00Z", current: false },
  { id: 3, label: "Firefox · Windows", last_seen: "2026-09-02T11:05:00Z", current: false },
];
/** «دستگاه‌های من» (GET /library/devices/): this browser plus two others. */
let fixtureDevices: ReaderDevice[] = [
  { id: 11, label: "Chrome · Linux", last_seen: new Date().toISOString(), current: true },
  { id: 12, label: "Safari · iPhone", last_seen: "2026-09-28T19:40:00Z", current: false },
  { id: 13, label: "Firefox · Windows", last_seen: "2026-09-02T11:05:00Z", current: false },
];
/** Copy quota per book: nearly used up so exhaustion is easy to try (limit 2000, used 1900). */
const fixtureQuota = new Map<string, CopyQuota>();
function fixtureQuotaFor(slug: string): CopyQuota {
  let q = fixtureQuota.get(slug);
  if (!q) {
    q = { limit: 2000, used: 1900 };
    fixtureQuota.set(slug, q);
  }
  return q;
}

/* Offline licenses (fixture): kept in localStorage so a reload — the offline test — still sees them. */
const FIXTURE_OFFLINE_KEY = "dadrose.reader.fixture.offline";
export const FIXTURE_OFFLINE_MAX = 3;
const FIXTURE_OFFLINE_DAYS = 14;
function fixtureSeedLicenses(): OfflineLicense[] {
  const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  return [
    { id: 901, book: "ayin-dadrasi-madani", title: "آیین دادرسی مدنی", device_label: "Chrome · Android", expires_at: at(9), created_at: at(-5) },
    { id: 902, book: "hoquq-jazaye-omumi", title: "حقوق جزای عمومی", device_label: "Safari · iPhone", expires_at: at(2), created_at: at(-12) },
  ];
}
function fixtureLicenses(): OfflineLicense[] {
  try {
    const raw = window.localStorage.getItem(FIXTURE_OFFLINE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as OfflineLicense[];
      if (Array.isArray(list)) return list.filter((l) => Date.parse(l.expires_at) > Date.now());
    }
  } catch {
    /* fall through */
  }
  return fixtureSeedLicenses();
}
function setFixtureLicenses(list: OfflineLicense[]): void {
  try {
    window.localStorage.setItem(FIXTURE_OFFLINE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Phase 6c fixtures: these slugs open with protection level «high» (reading band). */
export const HIGH_PROTECTION_FIXTURE_SLUGS = [`${EPUB_FIXTURE_SLUG}-high`, "pdf-sample-high"];
export const FIXTURE_TRACE_CODE = "K7Q2-M9XD";

function fixtureSession(slug: string): ReaderSession {
  const epub = slug === EPUB_FIXTURE_SLUG || slug === `${EPUB_FIXTURE_SLUG}-high`;
  return {
    book: {
      slug,
      title: epub ? "قانون مدنی در نظم کنونی" : "نمونه کتاب الکترونیک",
      subtitle: "",
      cover: null,
      authors: epub ? ["گروه مؤلفان دادرُز"] : ["دادرُز"],
      subjects: [],
    },
    file: epub
      ? { format: "EPUB", version: 1, url: "", expires_at: new Date(Date.now() + 5 * 60_000).toISOString() }
      : {
          format: "PDF",
          version: 1,
          url: "/fixtures/reader-sample.pdf",
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
    progress: fixtureProgressBySlug.get(slug) ?? null,
    watermark: "0912***4567 · ۱۴۰۵/۰۷/۱۰",
    copy_limit: 1000,
    epub: epub ? EPUB_FIXTURE.info : null,
    copy_quota: { ...fixtureQuotaFor(slug) },
    offline: epub
      ? {
          max_books: FIXTURE_OFFLINE_MAX,
          days: FIXTURE_OFFLINE_DAYS,
          license: fixtureLicenses().find((l) => l.book === slug && l.device_label === "Chrome · Linux") ?? null,
        }
      : null,
    protection: {
      level: HIGH_PROTECTION_FIXTURE_SLUGS.includes(slug) ? "high" : "standard",
      trace_code: FIXTURE_TRACE_CODE,
    },
  };
}

const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function fixtureSearch(q: string): SearchResponse {
  return searchChapterTexts(
    EPUB_FIXTURE.chapters.map((ch) => ({ index: ch.index, title: ch.title, text: fixtureText(ch.html) })),
    q,
  );
}

/* ---------- HTTP ---------- */

/**
 * Same-origin `/api/v1/library/…` through the Phase 3 session helper: first-party httpOnly cookies,
 * one silent token refresh on 401, never cached.
 */
async function call<T>(path: string, init: RequestInit = {}): Promise<ReaderResult<T>> {
  const headers = new Headers(init.headers);
  headers.set(DEVICE_HEADER, readerDeviceId());
  const res = await apiFetch<T>(`/library${path}`, { ...init, headers });
  if (res.ok) return { ok: true, data: res.data };
  if (res.status === 0) return { ok: false, error: { kind: "network" } };
  return { ok: false, error: errorFromResponse(res.status, res.error) };
}

const ok = <T>(data: T): ReaderResult<T> => ({ ok: true, data });

/** Reader stream: the same same-origin `/library…` call for the sample, problem report and free-claim clients. */
export const libraryCall = call;

/** GET /library/<slug>/read/ — book, signed file URL, progress and watermark. */
export function getReaderSession(slug: string): Promise<ReaderResult<ReaderSession>> {
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    if (slug === DEVICE_LIMIT_FIXTURE_SLUG && fixtureLimitDevices.length >= 3) {
      return Promise.resolve({ ok: false, error: { kind: "device_limit", devices: fixtureLimitDevices } });
    }
    return Promise.resolve(ok(fixtureSession(slug)));
  }
  return call<ReaderSession>(`/${slugSegment(slug)}/read/`);
}

/** PUT /library/<slug>/progress/. `keepalive` lets the save finish while the tab is being hidden/closed. */
export function saveProgress(
  slug: string,
  body: { page: number; total_pages: number; location?: string; ebook_version?: number | null },
  { keepalive = false } = {},
): Promise<ReaderResult<ReadingProgress>> {
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    const saved: ReadingProgress = {
      page: body.page,
      total_pages: body.total_pages,
      percent: progressPercent(body.page, body.total_pages),
      location: body.location ?? "",
      updated_at: new Date().toISOString(),
    };
    fixtureProgressBySlug.set(slug, saved);
    return Promise.resolve(ok(saved));
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
    if (fixtureDown()) return down();
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
    if (fixtureDown()) return down();
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
    if (fixtureDown()) return down();
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
    if (fixtureDown()) return down();
    fixtureHighlights = fixtureHighlights.filter((h) => h.id !== id);
    return Promise.resolve(ok(undefined));
  }
  return call<void>(`/${slugSegment(slug)}/highlights/${id}/`, { method: "DELETE" });
}

/* ---------- Phase 6: EPUB chapters, search, bookmarks, devices ---------- */

/** GET /library/<slug>/epub/chapters/<index>/ — one sanitized chapter. */
export function getChapter(slug: string, index: number): Promise<ReaderResult<EpubChapter>> {
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    const ch = EPUB_FIXTURE.chapters[index];
    return delay(ch ? ok(ch) : { ok: false, error: { kind: "http", status: 404 } });
  }
  return call<EpubChapter>(`/${slugSegment(slug)}/epub/chapters/${index}/`);
}

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

/** GET /library/<slug>/epub/search/?q= (2–100 characters after trimming). */
export function searchBook(slug: string, q: string): Promise<ReaderResult<SearchResponse>> {
  const query = q.trim().slice(0, SEARCH_MAX);
  if (query.length < SEARCH_MIN) return Promise.resolve(ok({ results: [], truncated: false }));
  if (readerFixtureEnabled()) return fixtureDown() ? down() : delay(ok(fixtureSearch(query)));
  return call<SearchResponse>(`/${slugSegment(slug)}/epub/search/?q=${encodeURIComponent(query)}`);
}

export const MAX_BOOKMARK_LABEL = 120;

export function listBookmarks(slug: string): Promise<ReaderResult<Bookmark[]>> {
  if (readerFixtureEnabled()) return fixtureDown() ? down() : Promise.resolve(ok([...fixtureBookmarks].sort((a, b) => a.page - b.page)));
  return call<Bookmark[]>(`/${slugSegment(slug)}/bookmarks/`);
}

export function createBookmark(
  slug: string,
  body: { page: number; location?: string; label?: string; ebook_version?: number | null },
): Promise<ReaderResult<Bookmark>> {
  const clean = {
    page: body.page,
    location: body.location ?? "",
    label: (body.label ?? "").slice(0, MAX_BOOKMARK_LABEL),
    ...(body.ebook_version ? { ebook_version: body.ebook_version } : {}),
  };
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    const same = fixtureBookmarks.find((b) => b.page === clean.page && b.location === clean.location);
    if (same) return Promise.resolve(ok(same));
    const b: Bookmark = { id: fixtureNextId++, ...clean, created_at: new Date().toISOString() };
    fixtureBookmarks = [...fixtureBookmarks, b];
    return Promise.resolve(ok(b));
  }
  return call<Bookmark>(`/${slugSegment(slug)}/bookmarks/`, { method: "POST", body: JSON.stringify(clean) });
}

export function deleteBookmark(slug: string, id: number): Promise<ReaderResult<void>> {
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    fixtureBookmarks = fixtureBookmarks.filter((b) => b.id !== id);
    return Promise.resolve(ok(undefined));
  }
  return call<void>(`/${slugSegment(slug)}/bookmarks/${id}/`, { method: "DELETE" });
}

/** GET /library/devices/ */
export function listDevices(): Promise<ReaderResult<ReaderDevice[]>> {
  if (readerFixtureEnabled()) return fixtureDown() ? down() : delay(ok(fixtureDevices));
  return call<ReaderDevice[]>("/devices/");
}

/** DELETE /library/devices/<id>/ (the server allows a few removals per day → 429). */
export function removeDevice(id: number): Promise<ReaderResult<void>> {
  if (readerFixtureEnabled()) {
    fixtureDevices = fixtureDevices.filter((d) => d.id !== id);
    fixtureLimitDevices = fixtureLimitDevices.filter((d) => d.id !== id);
    return delay(ok(undefined));
  }
  return call<void>(`/devices/${id}/`, { method: "DELETE" });
}

/* ---------- Phase 6b: offline reading ---------- */

function fixtureOfflineGrant(slug: string): ReaderResult<OfflineGrant> {
  if (slug !== EPUB_FIXTURE_SLUG) return { ok: false, error: { kind: "http", status: 400 } };
  const list = fixtureLicenses();
  const mine = list.find((l) => l.book === slug && l.device_label === "Chrome · Linux");
  if (!mine && list.length >= FIXTURE_OFFLINE_MAX) return { ok: false, error: { kind: "offline_limit", licenses: list } };
  const now = new Date();
  const license: OfflineLicense = {
    id: mine?.id ?? Math.max(950, ...list.map((l) => l.id)) + 1,
    book: slug,
    title: "قانون مدنی در نظم کنونی",
    device_label: "Chrome · Linux",
    expires_at: new Date(now.getTime() + FIXTURE_OFFLINE_DAYS * 86_400_000).toISOString(),
    created_at: mine?.created_at ?? now.toISOString(),
  };
  setFixtureLicenses([...list.filter((l) => l.id !== license.id), license]);
  const session = fixtureSession(slug);
  return ok({
    license,
    package: {
      epub: EPUB_FIXTURE.info,
      chapters: EPUB_FIXTURE.chapters,
      watermark: session.watermark,
      protection: session.protection ?? null,
      copy_limit: session.copy_limit,
      copy_quota: session.copy_quota,
    },
  });
}

/** POST /library/<slug>/offline/ — a license for this device plus the whole book (201 new, 200 renewed). */
export function requestOfflineCopy(slug: string): Promise<ReaderResult<OfflineGrant>> {
  if (readerFixtureEnabled()) return fixtureDown() ? down() : delay(fixtureOfflineGrant(slug), 400);
  return call<OfflineGrant>(`/${slugSegment(slug)}/offline/`, { method: "POST" });
}

/** GET /library/offline/ — the account's live offline licenses (all devices). */
export function listOfflineLicenses(): Promise<ReaderResult<OfflineLicense[]>> {
  if (readerFixtureEnabled()) return fixtureDown() ? down() : delay(ok(fixtureLicenses()));
  return call<OfflineLicense[]>("/offline/");
}

/** DELETE /library/offline/<id>/ */
export function deleteOfflineLicense(id: number): Promise<ReaderResult<void>> {
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    setFixtureLicenses(fixtureLicenses().filter((l) => l.id !== id));
    return delay(ok(undefined));
  }
  return call<void>(`/offline/${id}/`, { method: "DELETE" });
}

/* ---------- Phase 6b: copy quota, notebook export ---------- */

/** POST /library/<slug>/copies/ {chars} — report a copy the reader just made; answers the new quota. */
export function recordCopy(slug: string, chars: number): Promise<ReaderResult<CopyRecorded>> {
  const n = Math.max(0, Math.floor(chars));
  if (readerFixtureEnabled()) {
    if (fixtureDown()) return down();
    const q = fixtureQuotaFor(slug);
    const granted = Math.min(n, Math.max(0, q.limit - q.used));
    q.used += granted;
    return delay(ok({ limit: q.limit, used: q.used, granted }), 60);
  }
  return call<CopyRecorded>(`/${slugSegment(slug)}/copies/`, { method: "POST", body: JSON.stringify({ chars: n }) });
}

/* ---------- Phase 6c: screenshot protection ---------- */

/**
 * POST /library/<slug>/capture-events/ {kind} — report a detected capture attempt. Fire-and-forget:
 * the answer (204, also when throttled) and any failure are ignored. Fixture mode: no-op.
 */
export function reportCaptureEvent(slug: string, kind: CaptureEventKind): void {
  if (readerFixtureEnabled()) return;
  void call<void>(`/${slugSegment(slug)}/capture-events/`, {
    method: "POST",
    body: JSON.stringify({ kind }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Default name for an exported notebook when the server sends no usable Content-Disposition. */
export function notesFallbackName(slug: string, format: NotesExportFormat): string {
  return `دفترچه-یادداشت-${slug}.${format}`;
}

/**
 * File name from a Content-Disposition header: RFC 5987 `filename*=UTF-8''…` wins over
 * `filename="…"`; path separators and control characters are dropped. Fallback when absent/empty.
 */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  let name = "";
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      name = decodeURIComponent(star[2]!.trim().replace(/^"|"$/g, ""));
    } catch {
      name = "";
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
    if (plain) name = (plain[1] ?? plain[2] ?? "").replace(/\\(.)/g, "$1").trim();
  }
  name = name.replace(/[\\/\u0000-\u001f]/g, "").replace(/^\.+/, "").trim();
  return name || fallback;
}

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fixture notebook (the real one is built by the server: grouped by chapter/page, quotes cut). */
function fixtureNotebook(slug: string, format: NotesExportFormat): ExportedFile {
  const session = fixtureSession(slug);
  const title = session.book.title;
  const date = new Date().toLocaleDateString("fa-IR-u-ca-persian");
  const hl = [...fixtureHighlights].sort((a, b) => a.page - b.page || a.id - b.id);
  const bm = [...fixtureBookmarks].sort((a, b) => a.page - b.page || a.id - b.id);
  const cut = (t: string) => (t.length > 300 ? `${t.slice(0, 300)}…` : t);
  let body: string;
  if (format === "md") {
    const lines = [`# دفترچه یادداشت «${title}»`, "", `${session.book.authors.join("، ")} · تاریخ دریافت: ${date}`, "", "## هایلایت‌ها", ""];
    if (!hl.length) lines.push("هنوز هایلایتی ندارید.", "");
    for (const h of hl) {
      lines.push(`- **صفحه ${h.page}** (${HIGHLIGHT_COLORS.find((c) => c.value === h.color)?.label ?? ""})`, `  > ${cut(h.text)}`);
      if (h.note) lines.push(`  - یادداشت: ${h.note}`);
      lines.push("");
    }
    lines.push("## نشانک‌ها", "");
    if (!bm.length) lines.push("هنوز نشانکی ندارید.");
    for (const b of bm) lines.push(`- صفحه ${b.page}${b.label ? ` — ${b.label}` : ""}`);
    body = `${lines.join("\n")}\n`;
  } else {
    const items = hl
      .map(
        (h) =>
          `<li><p class="page">صفحه ${h.page}</p><blockquote>${escapeHtml(cut(h.text))}</blockquote>${
            h.note ? `<p class="note">یادداشت: ${escapeHtml(h.note)}</p>` : ""
          }</li>`,
      )
      .join("");
    const marks = bm.map((b) => `<li>صفحه ${b.page}${b.label ? ` — ${escapeHtml(b.label)}` : ""}</li>`).join("");
    body =
      `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>دفترچه یادداشت ${escapeHtml(title)}</title>` +
      `<style>body{font-family:Vazirmatn,Tahoma,sans-serif;max-width:40em;margin:2em auto;padding:0 1em;line-height:1.9;color:#10182B}` +
      `blockquote{margin:.3em 0;padding:.4em 1em;border-inline-start:4px solid #C8A24B;background:#F5F6F9}.page{font-weight:700;margin:0}.note{color:#3a4458}` +
      `ul{list-style:none;padding:0}li{margin-bottom:1em}</style></head><body>` +
      `<h1>دفترچه یادداشت «${escapeHtml(title)}»</h1><p>${escapeHtml(session.book.authors.join("، "))} · تاریخ دریافت: ${date}</p>` +
      `<h2>هایلایت‌ها</h2>${items ? `<ul>${items}</ul>` : "<p>هنوز هایلایتی ندارید.</p>"}` +
      `<h2>نشانک‌ها</h2>${marks ? `<ul>${marks}</ul>` : "<p>هنوز نشانکی ندارید.</p>"}</body></html>`;
  }
  const type = format === "md" ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8";
  return { blob: new Blob([body], { type }), filename: notesFallbackName(slug, format) };
}

/**
 * GET /library/<slug>/notes/export/?format=md|html → the notebook file (same-origin, cookies, one
 * silent refresh on 401). The name comes from Content-Disposition.
 */
export async function exportNotes(slug: string, format: NotesExportFormat): Promise<ReaderResult<ExportedFile>> {
  if (readerFixtureEnabled()) return delay(ok(fixtureNotebook(slug, format)));
  const url = `${BROWSER_API}/library/${slugSegment(slug)}/notes/export/?format=${format}`;
  const send = () =>
    fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: format === "md" ? "text/markdown, */*" : "text/html, */*", [DEVICE_HEADER]: readerDeviceId() },
    });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    return { ok: false, error: errorFromResponse(res.status, body) };
  }
  const blob = await res.blob();
  return {
    ok: true,
    data: { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition"), notesFallbackName(slug, format)) },
  };
}

/** Save a Blob as a download (object URL + temporary <a download>). */
export function saveBlob({ blob, filename }: ExportedFile): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
