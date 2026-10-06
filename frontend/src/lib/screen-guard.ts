/**
 * Phase 6c: screenshot deterrence for the ebook readers (docs/api-contract.md «Phase 6c»).
 *
 * A web page cannot stop an OS screenshot. What it can do is blank the book whenever it gets a
 * signal before or around a capture (focus lost, page hidden, a screenshot key combination held,
 * three-finger touch, the pointer leaving the window) and draw a per-user trace code over every page
 * so a leaked image can be traced. This module is the pure, DOM-free part: the blank/unblank state
 * machine, report debouncing, the trace-code tile and the reading-band geometry.
 */
import type { CaptureEventKind, ProtectionLevel, ReaderProtection } from "./types";

/** The screen stays blank this long after the last key / touch trigger ends. */
export const GUARD_TAIL_MS = 600;
/** At most one report per kind in this window. */
export const REPORT_GAP_MS = 10_000;
/** Written to the clipboard on PrintScreen (replaces whatever the OS put there, when allowed). */
export const CLIPBOARD_NOTICE = "محتوای این کتاب الکترونیک قابل عکس‌برداری نیست. — کتابفروشی دادرُز";
export const GUARD_MESSAGE = "برای ادامه مطالعه به صفحه برگردید";
export const BAND_HINT = "برای حفاظت از این کتاب، فقط چند خط در هر لحظه نمایش داده می‌شود";
/** Lines kept sharp in the reading band («high» level). */
export const BAND_LINES = 5;

export interface Protection {
  level: ProtectionLevel;
  traceCode: string;
}

/** Missing/null/unknown protection (older servers, offline copies) → standard, no trace code. */
export function protectionOf(p: ReaderProtection | null | undefined): Protection {
  return {
    level: p?.level === "high" ? "high" : "standard",
    traceCode: typeof p?.trace_code === "string" ? p.trace_code.trim() : "",
  };
}

/* ---------- state machine ---------- */

export interface KeyInput {
  type: "keydown" | "keyup";
  key: string;
  code?: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** the event target is one of the reader's own inputs (search box, note, page number) */
  typing: boolean;
}

/** Normalised browser signals (the hook turns DOM events into these). */
export type GuardInput =
  | { type: "blur" }
  | { type: "focus" }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "beforeprint" }
  | { type: "afterprint" }
  | KeyInput
  /** touchstart / touchend / touchcancel with the number of touches still on the screen */
  | { type: "touches"; count: number; start: boolean }
  /** desktop (pointer: fine) only */
  | { type: "pointerout" }
  | { type: "pointerin" }
  /** click/tap on the blank overlay */
  | { type: "restore" };

export type BlankReason = "focus" | "keys" | "touch" | "pointer" | "tail" | "print";

export interface GuardCallbacks {
  /** Called synchronously, inside the event handler, whenever the blank state flips. */
  onChange: (blank: boolean, reason: BlankReason | null) => void;
  onReport?: (kind: CaptureEventKind) => void;
  /** PrintScreen released: overwrite the clipboard. */
  onPrintScreen?: () => void;
}

export interface GuardOptions {
  tailMs?: number;
  reportGapMs?: number;
  now?: () => number;
}

export interface Guard {
  input: (e: GuardInput) => void;
  isBlank: () => boolean;
  reason: () => BlankReason | null;
  dispose: () => void;
}

const META_KEYS = new Set(["Meta", "OS", "Super", "Hyper", "MetaLeft", "MetaRight"]);
/** ChromeOS «Show windows» (Overview) key as browsers report it. */
const SHOW_WINDOWS_KEYS = new Set(["F5", "LaunchApplication1", "LaunchMissionControl", "MediaApps"]);

export function isMetaKey(key: string): boolean {
  return META_KEYS.has(key);
}

export function isPrintScreen(key: string, code?: string): boolean {
  return key === "PrintScreen" || code === "PrintScreen" || key === "Snapshot";
}

export function isShowWindowsKey(key: string, code?: string): boolean {
  return SHOW_WINDOWS_KEYS.has(key) || (code !== undefined && SHOW_WINDOWS_KEYS.has(code));
}

/**
 * Blank/unblank state machine. Blank while: the window is blurred or the page hidden (until focus or
 * a tap on the overlay); a screenshot key combination is held; 3+ fingers touch the screen; the
 * mouse is outside the window; printing. Key and touch triggers keep the screen blank for a short
 * tail after they end.
 */
export function createGuard(cb: GuardCallbacks, opts: GuardOptions = {}): Guard {
  const tailMs = opts.tailMs ?? GUARD_TAIL_MS;
  const gapMs = opts.reportGapMs ?? REPORT_GAP_MS;
  const now = opts.now ?? (() => Date.now());

  let unfocused = false;
  let hidden = false;
  let printing = false;
  let pointerOut = false;
  let multiTouch = false;
  const keys = { meta: false, alt: false, ctrlShift: false, printScreen: false };
  let tailUntil = 0;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  let last: { blank: boolean; reason: BlankReason | null } = { blank: false, reason: null };
  const reported = new Map<CaptureEventKind, number>();

  const keysHeld = () => keys.meta || keys.alt || keys.ctrlShift || keys.printScreen;

  function currentReason(): BlankReason | null {
    if (printing) return "print";
    if (unfocused || hidden) return "focus";
    if (keysHeld()) return "keys";
    if (multiTouch) return "touch";
    if (pointerOut) return "pointer";
    if (now() < tailUntil) return "tail";
    return null;
  }

  function emit() {
    const reason = currentReason();
    const blank = reason !== null;
    if (blank !== last.blank || reason !== last.reason) {
      last = { blank, reason };
      cb.onChange(blank, reason);
    }
  }

  function startTail() {
    tailUntil = now() + tailMs;
    if (tailTimer) clearTimeout(tailTimer);
    tailTimer = setTimeout(() => {
      tailTimer = null;
      emit();
    }, tailMs);
  }

  function report(kind: CaptureEventKind) {
    const t = now();
    const prev = reported.get(kind);
    if (prev !== undefined && t - prev < gapMs) return;
    reported.set(kind, t);
    cb.onReport?.(kind);
  }

  function onKey(e: KeyInput) {
    const down = e.type === "keydown";
    const before = keysHeld();

    if (isPrintScreen(e.key, e.code)) {
      keys.printScreen = down;
      report("print_screen");
      if (!down) cb.onPrintScreen?.();
    }

    // Meta / Win / Cmd: the flag, or the key itself on keydown (some browsers leave the flag off for "OS")
    keys.meta = e.meta || (down && isMetaKey(e.key));
    if (!down && isMetaKey(e.key)) keys.meta = false;
    if (keys.meta && e.shift) report("shortcut"); // Win+Shift+S, Cmd+Shift+3/4/5

    // Alt (Alt+PrintScreen); never inside the reader's own inputs (Alt+Shift switches the keyboard layout)
    keys.alt = e.alt && !e.typing;

    // Ctrl+Shift (+ «Show windows» on ChromeOS). In an input Ctrl+Shift+arrows selects words: only the
    // full combination counts there.
    const ctrlShift = e.ctrl && e.shift;
    const showWindows = ctrlShift && isShowWindowsKey(e.key, e.code);
    if (showWindows && down) report("shortcut");
    keys.ctrlShift = ctrlShift && (!e.typing || (down && showWindows));

    if (before && !keysHeld()) startTail();
    else if (!down && isPrintScreen(e.key, e.code)) startTail(); // PrintScreen often comes as keyup only
    emit();
  }

  function input(e: GuardInput) {
    switch (e.type) {
      case "blur":
        unfocused = true;
        break;
      case "focus":
        unfocused = false;
        // key-ups are lost while another window had focus (Win+Shift+S opens the snipping bar)
        if (keysHeld()) {
          keys.meta = keys.alt = keys.ctrlShift = keys.printScreen = false;
          startTail();
        }
        break;
      case "hidden":
        hidden = true;
        break;
      case "visible":
        hidden = false;
        break;
      case "beforeprint":
        printing = true;
        break;
      case "afterprint":
        printing = false;
        break;
      case "keydown":
      case "keyup":
        return onKey(e);
      case "touches":
        if (e.start && e.count >= 3) {
          if (!multiTouch) report("multi_touch");
          multiTouch = true;
        } else if (e.count === 0 && multiTouch) {
          multiTouch = false;
          startTail();
        }
        break;
      case "pointerout":
        pointerOut = true;
        break;
      case "pointerin":
        pointerOut = false;
        break;
      case "restore":
        // the reader tapped the overlay: they are here and looking (keys/touch triggers still apply)
        unfocused = false;
        pointerOut = false;
        break;
    }
    emit();
  }

  return {
    input,
    isBlank: () => currentReason() !== null,
    reason: currentReason,
    dispose: () => {
      if (tailTimer) clearTimeout(tailTimer);
      tailTimer = null;
    },
  };
}

/* ---------- trace-code watermark ---------- */

export type GuardTheme = "light" | "sepia" | "dark";

/**
 * Trace ink per reader theme: faint enough not to disturb reading (≈5–7% on light paper), legible
 * once a screenshot's contrast is pushed up.
 */
export function traceInk(theme: GuardTheme): string {
  if (theme === "dark") return "rgba(230,232,238,0.075)";
  if (theme === "sepia") return "rgba(59,45,26,0.075)";
  return "rgba(16,24,43,0.06)";
}

/** Small deterministic PRNG (mulberry32) seeded from the code: same code → same tile. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TracePlacement {
  x: number;
  y: number;
  angle: number;
}

/**
 * Jittered, staggered grid of positions for the code inside a `width`×`height` area. With width a
 * multiple of stepX and height an even multiple of stepY the grid repeats seamlessly (SVG tile).
 */
export function tracePlacements(code: string, width: number, height: number, stepX: number, stepY: number): TracePlacement[] {
  const rnd = seededRandom(code || "-");
  const out: TracePlacement[] = [];
  const cols = Math.max(1, Math.ceil(width / stepX));
  const rows = Math.max(1, Math.ceil(height / stepY));
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? 0 : stepX / 2;
    for (let col = 0; col < cols; col++) {
      out.push({
        x: Math.round(col * stepX + shift + (rnd() - 0.5) * stepX * 0.3),
        y: Math.round(row * stepY + stepY / 2 + (rnd() - 0.5) * stepY * 0.35),
        angle: Math.round(-30 + (rnd() - 0.5) * 16),
      });
    }
  }
  return out;
}

export const TRACE_TILE = { width: 300, height: 180, stepX: 150, stepY: 45 };

/** CSS `url(...)` of an SVG tile with the trace code repeated densely (jittered, rotated). */
export function traceTile(code: string, theme: GuardTheme): string {
  if (!code) return "none";
  const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const { width, height, stepX, stepY } = TRACE_TILE;
  // copies across the tile edges so the repeated tiles join without clipped fragments
  const reachX = stepX / 2;
  const reachY = stepY / 2;
  const texts = tracePlacements(code, width, height, stepX, stepY)
    .flatMap((p) =>
      [-width, 0, width].flatMap((dx) =>
        [-height, 0, height]
          .map((dy) => ({ ...p, x: p.x + dx, y: p.y + dy }))
          .filter((q) => q.x > -reachX && q.x < width + reachX && q.y > -reachY && q.y < height + reachY),
      ),
    )
    .map((p) => `<text x="${p.x}" y="${p.y}" transform="rotate(${p.angle} ${p.x} ${p.y})">${esc}</text>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<g fill="${traceInk(theme)}" font-family="Menlo, Consolas, DejaVu Sans Mono, monospace" font-size="12" font-weight="700" ` +
    `text-anchor="middle" dominant-baseline="middle" direction="ltr" letter-spacing="1">${texts}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/* ---------- reading band («high») ---------- */

/** Band height in px for `lines` lines of text. */
export function bandHeight(linePx: number, containerH: number, lines = BAND_LINES): number {
  const h = Math.round(linePx * lines);
  return Math.max(0, Math.min(h, containerH));
}

/** Band top (px) for a band centred on `centerY`, kept inside the container. */
export function bandTopFor(centerY: number, bandH: number, containerH: number): number {
  const top = Math.round(centerY - bandH / 2);
  return Math.max(0, Math.min(top, Math.max(0, containerH - bandH)));
}

/**
 * Move the band one step (band height minus one line, so a line is kept for context).
 * Returns the new top, or `"next"`/`"prev"` when the band is already at the end of the page.
 */
export function stepBand(top: number, dir: 1 | -1, bandH: number, linePx: number, containerH: number): number | "next" | "prev" {
  const max = Math.max(0, containerH - bandH);
  if (dir > 0 && top >= max - 1) return "next";
  if (dir < 0 && top <= 1) return "prev";
  const step = Math.max(linePx, bandH - linePx);
  return Math.max(0, Math.min(max, Math.round(top + dir * step)));
}
