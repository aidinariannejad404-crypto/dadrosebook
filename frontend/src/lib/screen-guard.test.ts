import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARD_TAIL_MS,
  REPORT_GAP_MS,
  bandHeight,
  bandTopFor,
  createGuard,
  protectionOf,
  stepBand,
  traceInk,
  tracePlacements,
  traceTile,
  type GuardInput,
  type KeyInput,
} from "./screen-guard";
import type { CaptureEventKind } from "./types";

type KeyInit = Partial<Omit<KeyInput, "type">> & { key: string };
const key = (type: "keydown" | "keyup", k: KeyInit): GuardInput => ({
  type,
  meta: false,
  ctrl: false,
  shift: false,
  alt: false,
  typing: false,
  ...k,
});

function setup() {
  const changes: { blank: boolean; reason: string | null }[] = [];
  const reports: CaptureEventKind[] = [];
  const onPrintScreen = vi.fn();
  const g = createGuard({
    onChange: (blank, reason) => changes.push({ blank, reason }),
    onReport: (k) => reports.push(k),
    onPrintScreen,
  });
  return { g, changes, reports, onPrintScreen };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("screen guard: focus and visibility", () => {
  it("blanks on blur synchronously and restores on focus without a tail", () => {
    const { g, changes } = setup();
    g.input({ type: "blur" });
    expect(g.isBlank()).toBe(true);
    expect(changes).toEqual([{ blank: true, reason: "focus" }]);
    g.input({ type: "focus" });
    expect(g.isBlank()).toBe(false);
    expect(changes.at(-1)).toEqual({ blank: false, reason: null });
  });

  it("blanks while hidden (visibilitychange/pagehide/freeze) and comes back when visible", () => {
    const { g } = setup();
    g.input({ type: "hidden" });
    expect(g.reason()).toBe("focus");
    g.input({ type: "visible" });
    expect(g.isBlank()).toBe(false);
  });

  it("a tap on the overlay restores a blur blank but not a held key", () => {
    const { g } = setup();
    g.input({ type: "blur" });
    g.input({ type: "restore" });
    expect(g.isBlank()).toBe(false);
    g.input(key("keydown", { key: "Meta", meta: true }));
    g.input({ type: "restore" });
    expect(g.isBlank()).toBe(true);
  });

  it("blanks while printing", () => {
    const { g } = setup();
    g.input({ type: "beforeprint" });
    expect(g.reason()).toBe("print");
    g.input({ type: "afterprint" });
    expect(g.isBlank()).toBe(false);
  });

  it("does not report plain blur or visibility changes", () => {
    const { g, reports } = setup();
    g.input({ type: "blur" });
    g.input({ type: "hidden" });
    expect(reports).toEqual([]);
  });
});

describe("screen guard: keys", () => {
  it("Meta+Shift blanks, reports «shortcut» and stays blank for the tail after release", () => {
    const { g, reports } = setup();
    g.input(key("keydown", { key: "Meta", meta: true }));
    expect(g.reason()).toBe("keys");
    g.input(key("keydown", { key: "Shift", meta: true, shift: true }));
    expect(reports).toEqual(["shortcut"]);
    g.input(key("keyup", { key: "Shift", meta: true }));
    expect(g.isBlank()).toBe(true);
    g.input(key("keyup", { key: "Meta" }));
    expect(g.reason()).toBe("tail");
    vi.advanceTimersByTime(GUARD_TAIL_MS - 1);
    expect(g.isBlank()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(g.isBlank()).toBe(false);
  });

  it("the tail timer emits the unblank change", () => {
    const { g, changes } = setup();
    g.input(key("keydown", { key: "OS" }));
    g.input(key("keyup", { key: "OS" }));
    expect(changes.at(-1)).toEqual({ blank: true, reason: "tail" });
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    expect(changes.at(-1)).toEqual({ blank: false, reason: null });
  });

  it("stays blank until the window has focus again, even after keys are released", () => {
    const { g } = setup();
    g.input(key("keydown", { key: "Meta", meta: true }));
    g.input({ type: "blur" }); // the snipping bar takes focus; the key-up never arrives
    vi.advanceTimersByTime(5000);
    expect(g.isBlank()).toBe(true);
    g.input({ type: "focus" });
    expect(g.reason()).toBe("tail");
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    expect(g.isBlank()).toBe(false);
  });

  it("PrintScreen keyup blanks with a tail, reports and overwrites the clipboard", () => {
    const { g, reports, onPrintScreen } = setup();
    g.input(key("keyup", { key: "PrintScreen" }));
    expect(g.isBlank()).toBe(true);
    expect(reports).toEqual(["print_screen"]);
    expect(onPrintScreen).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    expect(g.isBlank()).toBe(false);
  });

  it("PrintScreen keydown blanks until released", () => {
    const { g } = setup();
    g.input(key("keydown", { key: "PrintScreen", code: "PrintScreen" }));
    expect(g.reason()).toBe("keys");
    g.input(key("keyup", { key: "PrintScreen", code: "PrintScreen" }));
    expect(g.reason()).toBe("tail");
  });

  it("Alt blanks outside inputs (Alt+PrintScreen) but not while typing", () => {
    const { g } = setup();
    g.input(key("keydown", { key: "Alt", alt: true }));
    expect(g.isBlank()).toBe(true);
    g.input(key("keyup", { key: "Alt" }));
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    g.input(key("keydown", { key: "Alt", alt: true, typing: true }));
    expect(g.isBlank()).toBe(false);
  });

  it("Shift alone and Ctrl alone never blank", () => {
    const { g, changes } = setup();
    g.input(key("keydown", { key: "Shift", shift: true }));
    g.input(key("keyup", { key: "Shift" }));
    g.input(key("keydown", { key: "Control", ctrl: true, typing: true }));
    g.input(key("keydown", { key: "a", ctrl: true, typing: true }));
    g.input(key("keyup", { key: "Control" }));
    g.input(key("keydown", { key: "ی", typing: true }));
    expect(changes).toEqual([]);
  });

  it("Ctrl+Shift blanks outside inputs; in an input only with the «Show windows» key", () => {
    const { g, reports } = setup();
    g.input(key("keydown", { key: "Shift", ctrl: true, shift: true }));
    expect(g.isBlank()).toBe(true);
    expect(reports).toEqual([]);
    g.input(key("keyup", { key: "Shift", ctrl: true }));
    g.input(key("keyup", { key: "Control" }));
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    expect(g.isBlank()).toBe(false);

    // typing: Ctrl+Shift+ArrowLeft selects a word → no blank
    g.input(key("keydown", { key: "Shift", ctrl: true, shift: true, typing: true }));
    g.input(key("keydown", { key: "ArrowLeft", ctrl: true, shift: true, typing: true }));
    expect(g.isBlank()).toBe(false);
    // ChromeOS screenshot: Ctrl+Shift+Show windows
    g.input(key("keydown", { key: "F5", ctrl: true, shift: true, typing: true }));
    expect(g.isBlank()).toBe(true);
    expect(reports).toEqual(["shortcut"]);
  });

  it("Meta blanks even while typing (a listed combination)", () => {
    const { g } = setup();
    g.input(key("keydown", { key: "Meta", meta: true, typing: true }));
    expect(g.isBlank()).toBe(true);
  });
});

describe("screen guard: touch and pointer", () => {
  it("3+ touches blank and report; release keeps a tail", () => {
    const { g, reports } = setup();
    g.input({ type: "touches", count: 3, start: true });
    expect(g.reason()).toBe("touch");
    expect(reports).toEqual(["multi_touch"]);
    g.input({ type: "touches", count: 1, start: false });
    expect(g.isBlank()).toBe(true);
    g.input({ type: "touches", count: 0, start: false });
    expect(g.reason()).toBe("tail");
    vi.advanceTimersByTime(GUARD_TAIL_MS);
    expect(g.isBlank()).toBe(false);
  });

  it("one- and two-finger touches (scroll, pinch zoom) never blank", () => {
    const { g, changes } = setup();
    g.input({ type: "touches", count: 1, start: true });
    g.input({ type: "touches", count: 2, start: true });
    g.input({ type: "touches", count: 0, start: false });
    expect(changes).toEqual([]);
  });

  it("pointer leaving the window blanks; coming back restores at once", () => {
    const { g } = setup();
    g.input({ type: "pointerout" });
    expect(g.reason()).toBe("pointer");
    g.input({ type: "pointerin" });
    expect(g.isBlank()).toBe(false);
  });
});

describe("screen guard: report debounce", () => {
  it("reports each kind at most once per 10 s", () => {
    const { g, reports } = setup();
    const ps = () => g.input(key("keyup", { key: "PrintScreen" }));
    ps();
    ps();
    g.input({ type: "touches", count: 3, start: true });
    g.input({ type: "touches", count: 0, start: false });
    vi.advanceTimersByTime(REPORT_GAP_MS - 1);
    ps();
    expect(reports).toEqual(["print_screen", "multi_touch"]);
    vi.advanceTimersByTime(1);
    ps();
    expect(reports).toEqual(["print_screen", "multi_touch", "print_screen"]);
  });
});

describe("protection, trace tile and band geometry", () => {
  it("treats a missing protection as standard without a trace code", () => {
    expect(protectionOf(undefined)).toEqual({ level: "standard", traceCode: "" });
    expect(protectionOf(null)).toEqual({ level: "standard", traceCode: "" });
    expect(protectionOf({ level: "high", trace_code: " K7Q2-M9XD " })).toEqual({ level: "high", traceCode: "K7Q2-M9XD" });
  });

  it("draws the escaped code many times with theme ink, deterministically", () => {
    expect(traceTile("", "light")).toBe("none");
    const tile = decodeURIComponent(traceTile("K7Q2-M9XD", "light"));
    expect(tile.match(/K7Q2-M9XD/g)!.length).toBeGreaterThanOrEqual(6);
    expect(tile).toContain(traceInk("light"));
    expect(traceTile("K7Q2-M9XD", "dark")).toContain(encodeURIComponent(traceInk("dark")));
    expect(traceTile("K7Q2-M9XD", "light")).toBe(traceTile("K7Q2-M9XD", "light"));
    expect(decodeURIComponent(traceTile("<a&b>", "sepia"))).toContain("&lt;a&amp;b&gt;");
  });

  it("jitters placements per code", () => {
    const a = tracePlacements("AAAA-BBBB", 300, 180, 150, 60);
    const b = tracePlacements("CCCC-DDDD", 300, 180, 150, 60);
    expect(a.length).toBe(b.length);
    expect(a).not.toEqual(b);
  });

  it("keeps the band inside the container and steps through the page", () => {
    expect(bandHeight(32, 600)).toBe(160);
    expect(bandHeight(32, 100)).toBe(100);
    expect(bandTopFor(300, 160, 600)).toBe(220);
    expect(bandTopFor(10, 160, 600)).toBe(0);
    expect(bandTopFor(590, 160, 600)).toBe(440);
    expect(stepBand(0, 1, 160, 32, 600)).toBe(128);
    expect(stepBand(400, 1, 160, 32, 600)).toBe(440);
    expect(stepBand(440, 1, 160, 32, 600)).toBe("next");
    expect(stepBand(0, -1, 160, 32, 600)).toBe("prev");
    expect(stepBand(100, -1, 160, 32, 600)).toBe(0);
  });
});
