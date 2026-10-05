import type { CopyQuota, EpubChapterMeta } from "./types";

/**
 * Pure EPUB reader helpers (Phase 6, docs/api-contract.md «Phase 6»). No DOM, unit-tested.
 * Text offsets are UTF-16 indices into the chapter root's `textContent`.
 */

/* ---------- folding (search + occurrence matching; the server folds the same way) ---------- */

/**
 * Fold one UTF-16 code unit. Strictly one-to-one so offsets in the folded string are offsets in the
 * original: ي/ى → ی، ك → ک، Persian/Arabic-Indic digits → ASCII, ZWNJ → space, otherwise
 * toLowerCase() when that stays one unit long.
 */
export function foldChar(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c === 0x064a || c === 0x0649) return "ی";
  if (c === 0x0643) return "ک";
  if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0);
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
  if (c === 0x200c) return " ";
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower : ch;
}

/** Fold a whole string; the result always has the same length as the input. */
export function foldText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]!);
  return out;
}

/**
 * Offsets [start, end) of the `n`-th (0-based) non-overlapping folded occurrence of `query` in
 * `text`, or null. The query is trimmed; the text is not.
 */
export function findNthFolded(text: string, query: string, n: number): { start: number; end: number } | null {
  const q = foldText(query.trim());
  if (!q || n < 0) return null;
  const hay = foldText(text);
  let from = 0;
  let seen = 0;
  for (;;) {
    const i = hay.indexOf(q, from);
    if (i < 0) return null;
    if (seen === n) return { start: i, end: i + q.length };
    seen++;
    from = i + q.length;
  }
}

/* ---------- locations ---------- */

export type EpubLocation =
  | { kind: "point"; chapter: number; offset: number }
  | { kind: "range"; chapter: number; start: number; end: number };

/** "epub:<chapter>:<offset>" */
export function formatEpubPoint(chapter: number, offset: number): string {
  return `epub:${Math.max(0, Math.floor(chapter))}:${Math.max(0, Math.floor(offset))}`;
}

/** "epub:<chapter>:<start>-<end>" (start ≤ end) */
export function formatEpubRange(chapter: number, start: number, end: number): string {
  const a = Math.max(0, Math.floor(Math.min(start, end)));
  const b = Math.max(0, Math.floor(Math.max(start, end)));
  return `epub:${Math.max(0, Math.floor(chapter))}:${a}-${b}`;
}

/** Parse a point or range location; null for "", PDF locations and malformed input. */
export function parseEpubLocation(value: string | null | undefined): EpubLocation | null {
  const m = /^epub:(\d+):(\d+)(?:-(\d+))?$/.exec((value ?? "").trim());
  if (!m) return null;
  const chapter = Number(m[1]);
  const start = Number(m[2]);
  if (m[3] === undefined) return { kind: "point", chapter, offset: start };
  const end = Number(m[3]);
  if (end < start) return null;
  return { kind: "range", chapter, start, end };
}

/** Start offset of either kind of location. */
export function locationStart(loc: EpubLocation): number {
  return loc.kind === "point" ? loc.offset : loc.start;
}

/** Internal link `#epub:<chapter>:<anchor>` (anchor may be empty) → target, else null. */
export function parseEpubHref(href: string | null | undefined): { chapter: number; anchor: string } | null {
  const m = /^#epub:(\d+):(.*)$/.exec(href ?? "");
  if (!m) return null;
  let anchor = m[2] ?? "";
  try {
    anchor = decodeURIComponent(anchor);
  } catch {
    /* keep it raw */
  }
  return { chapter: Number(m[1]), anchor };
}

/** Element id of a TOC/link anchor inside the chapter html (the server prefixes ids). */
export function anchorElementId(anchor: string): string {
  return `epub-${anchor}`;
}

/* ---------- virtual pages ---------- */

/** Virtual page (1-based, within the chapter's pages) of a text offset in that chapter. */
export function virtualPage(meta: Pick<EpubChapterMeta, "start_page" | "pages" | "chars">, offset: number): number {
  const pages = Math.max(1, Math.floor(meta.pages) || 1);
  const start = Math.max(1, Math.floor(meta.start_page) || 1);
  if (!(meta.chars > 0) || !Number.isFinite(offset) || offset <= 0) return start;
  const within = Math.floor((Math.min(offset, meta.chars) / meta.chars) * pages);
  return start + Math.min(pages - 1, Math.max(0, within));
}

/** Chapter index holding a virtual page (for progress saved without a location). */
export function chapterForPage(chapters: EpubChapterMeta[], page: number): number {
  let found = chapters[0]?.index ?? 0;
  for (const c of chapters) if (c.start_page <= page) found = c.index;
  return found;
}

/** Approximate text offset where a virtual page starts inside its chapter (inverse of virtualPage). */
export function offsetForPage(meta: Pick<EpubChapterMeta, "start_page" | "pages" | "chars">, page: number): number {
  const pages = Math.max(1, meta.pages);
  const within = Math.min(pages - 1, Math.max(0, page - meta.start_page));
  return Math.ceil((within / pages) * Math.max(0, meta.chars));
}

/* ---------- copy citation ---------- */

export const COPY_SOURCE = "کتابفروشی دادرُز";

export interface CopyResult {
  text: string;
  truncated: boolean;
}

/**
 * The text that lands on the clipboard: the selection cut to `limit` characters, then
 * "\n\n— «عنوان»، نویسندگان، کتابفروشی دادرُز".
 */
export function buildCopyText(selection: string, limit: number, book: { title: string; authors: string[] }): CopyResult {
  const { text, truncated } = cutCopy(selection, limit, book);
  return { text, truncated };
}

function cutCopy(selection: string, limit: number, book: { title: string; authors: string[] }) {
  const max = Math.max(0, Math.floor(limit) || 0);
  const truncated = selection.length > max;
  let body = truncated ? selection.slice(0, max) : selection;
  // do not leave half of a surrogate pair at the cut
  if (truncated && /[\uD800-\uDBFF]$/.test(body)) body = body.slice(0, -1);
  body = body.trim();
  const chars = body.length;
  if (truncated && body) body += "…";
  return { text: `${body}\n\n${citationLine(book)}`, truncated, chars };
}

/** "— «عنوان»، نویسندگان، کتابفروشی دادرُز": the line every copy ends with (alone once the quota is used up). */
export function citationLine(book: { title: string; authors: string[] }): string {
  const parts = [`«${book.title}»`];
  const authors = book.authors.filter(Boolean).join("، ");
  if (authors) parts.push(authors);
  parts.push(COPY_SOURCE);
  return `— ${parts.join("، ")}`;
}

/** Characters left in the book's total copy quota (never negative). */
export function quotaRemaining(quota: CopyQuota | null | undefined): number {
  if (!quota) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(quota.limit) - Math.floor(quota.used));
}

export interface CopyPlan {
  /** what goes on the clipboard */
  text: string;
  /** selection characters taken (what the reader reports to POST /copies/) */
  chars: number;
  truncated: boolean;
  /** the total quota is used up: only the citation line is copied */
  exhausted: boolean;
  /** which cap cut the selection: the per-copy `copy_limit` or the remaining total quota */
  limitedBy: "copy" | "quota" | null;
}

/**
 * Phase 6b copy rule: cut the selection to min(copy_limit, quota.limit − quota.used) (last known
 * `used`), append the citation; when nothing is left only the citation is copied.
 */
export function planCopy(
  selection: string,
  copyLimit: number,
  quota: CopyQuota | null | undefined,
  book: { title: string; authors: string[] },
): CopyPlan {
  const perCopy = Math.max(0, Math.floor(copyLimit) || 0);
  const remaining = quotaRemaining(quota);
  if (remaining <= 0) return { text: citationLine(book), chars: 0, truncated: selection.length > 0, exhausted: true, limitedBy: "quota" };
  const max = Math.min(perCopy, remaining);
  const out = cutCopy(selection, max, book);
  const limitedBy = out.truncated ? (remaining < perCopy ? "quota" : "copy") : null;
  return { text: out.text, chars: out.chars, truncated: out.truncated, exhausted: false, limitedBy };
}

/** `used` after the server granted a copy (or optimistically, before it answers). */
export function quotaAfterCopy(quota: CopyQuota, chars: number): CopyQuota {
  return { limit: quota.limit, used: Math.min(quota.limit, quota.used + Math.max(0, Math.floor(chars))) };
}

/* ---------- paginated mode (CSS columns) ---------- */

export type ReadingMode = "scroll" | "paged";
/** Paginated by default from this viewport width (tablets/desktops); phones scroll by default. */
export const PAGED_MIN_WIDTH = 768;

export function defaultReadingMode(viewportWidth: number): ReadingMode {
  return viewportWidth >= PAGED_MIN_WIDTH ? "paged" : "scroll";
}

/**
 * Column geometry for the paged layout: one column = the text width the scroll mode would use
 * (min(maxEm × font, box − 2 × padding)), gap = 2 × padding, so the next column starts exactly one
 * box-width away. All values are whole pixels.
 */
export function pagedGeometry(
  box: { width: number; height: number },
  opts: { fontPx: number; maxEm: number; padding: number; padBlock: number },
): { colWidth: number; gap: number; stride: number; height: number } {
  const colWidth = Math.max(120, Math.floor(Math.min(opts.maxEm * opts.fontPx, box.width - 2 * opts.padding)));
  const gap = Math.max(0, Math.round(2 * opts.padding));
  const height = Math.max(160, Math.floor(box.height - 2 * opts.padBlock));
  return { colWidth, gap, stride: colWidth + gap, height };
}

/** Number of columns of a multicol box whose scroll width is `scrollWidth`. */
export function columnCount(scrollWidth: number, colWidth: number, gap: number): number {
  const stride = colWidth + gap;
  if (!(stride > 0) || !(scrollWidth > 0)) return 1;
  return Math.max(1, Math.round((scrollWidth + gap) / stride));
}

/**
 * Column (relative to the one on screen: 0 = visible, 1 = next, −1 = previous) holding a point
 * at client x `cx`. RTL books flow their columns to the left, LTR ones to the right.
 */
export function relativeColumn(cx: number, frame: { left: number; right: number }, stride: number, rtl: boolean): number {
  if (!(stride > 0)) return 0;
  return Math.floor((rtl ? frame.right - cx : cx - frame.left) / stride);
}

/** Virtual page (the progress scale) of column `col` (0-based) out of `count` in a chapter. */
export function columnPage(meta: Pick<EpubChapterMeta, "start_page" | "pages">, col: number, count: number): number {
  const pages = Math.max(1, Math.floor(meta.pages) || 1);
  const start = Math.max(1, Math.floor(meta.start_page) || 1);
  const n = Math.max(1, Math.floor(count) || 1);
  const c = Math.min(n - 1, Math.max(0, Math.floor(col) || 0));
  return start + Math.min(pages - 1, Math.floor((c * pages) / n));
}

/* ---------- typography settings ---------- */

export const FONT_SIZES = [14, 16, 18, 20, 22, 25, 28] as const;
export const LINE_HEIGHTS = [1.5, 1.8, 2.0, 2.2] as const;
/** inline padding (px) and max line length (em) per margin step */
export const MARGINS = [
  { padding: 12, maxEm: 38 },
  { padding: 20, maxEm: 34 },
  { padding: 32, maxEm: 30 },
] as const;

export interface EpubSettings {
  fontSize: number; // index into FONT_SIZES
  lineHeight: number; // index into LINE_HEIGHTS
  margin: number; // index into MARGINS
  justify: boolean;
  /** «پیمایشی» / «صفحه‌ای»; absent = the default for this screen (defaultReadingMode) */
  mode?: ReadingMode;
}

/**
 * Defaults: 18px, line height 1.8, ~20px side padding / 34em line, ragged (start-aligned) text —
 * browsers cannot kashida-justify Persian, so justification is opt-in and never inserts kashida.
 */
export const DEFAULT_EPUB_SETTINGS: EpubSettings = { fontSize: 2, lineHeight: 1, margin: 1, justify: false };
export const EPUB_SETTINGS_KEY = "dadrose.reader.epub";

const idx = (v: unknown, len: number, fallback: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < len ? v : fallback;

/** Saved settings (any shape) → valid settings; unknown/invalid fields fall back to the defaults. */
export function sanitizeEpubSettings(raw: unknown): EpubSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_EPUB_SETTINGS;
  return {
    fontSize: idx(o.fontSize, FONT_SIZES.length, d.fontSize),
    lineHeight: idx(o.lineHeight, LINE_HEIGHTS.length, d.lineHeight),
    margin: idx(o.margin, MARGINS.length, d.margin),
    justify: typeof o.justify === "boolean" ? o.justify : d.justify,
    mode: o.mode === "scroll" || o.mode === "paged" ? o.mode : undefined,
  };
}

export function loadEpubSettings(): EpubSettings {
  try {
    const v = window.localStorage.getItem(EPUB_SETTINGS_KEY);
    return sanitizeEpubSettings(v ? JSON.parse(v) : null);
  } catch {
    return DEFAULT_EPUB_SETTINGS;
  }
}

export function saveEpubSettings(s: EpubSettings): void {
  try {
    window.localStorage.setItem(EPUB_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit */
  }
}

/* ---------- device id ---------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeviceId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** RFC 4122 v4 from 16 random bytes (fallback when crypto.randomUUID is missing). */
export function uuidFromBytes(bytes: ArrayLike<number>): string {
  const b = Array.from({ length: 16 }, (_, i) => (bytes[i] ?? 0) & 0xff);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
