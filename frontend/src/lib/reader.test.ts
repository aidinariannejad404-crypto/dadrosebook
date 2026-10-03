import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampPage,
  debounce,
  errorForStatus,
  fractionToPixels,
  getReaderSession,
  groupHighlightsByPage,
  mergeRects,
  needsUrlRefresh,
  parsePageInput,
  pointInRects,
  progressPercent,
  rectsToFractions,
  saveProgress,
} from "./reader";
import type { Highlight } from "./types";

describe("progressPercent", () => {
  it("computes percent with two decimals", () => {
    expect(progressPercent(37, 412)).toBe(8.98);
    expect(progressPercent(412, 412)).toBe(100);
    expect(progressPercent(1, 3)).toBe(33.33);
  });
  it("clamps the page and handles empty totals", () => {
    expect(progressPercent(999, 10)).toBe(100);
    expect(progressPercent(0, 10)).toBe(10);
    expect(progressPercent(5, 0)).toBe(0);
  });
});

describe("clampPage", () => {
  it("keeps pages within 1..total", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-3, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(Number.NaN, 10)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("parsePageInput", () => {
  it("accepts Persian, Arabic-Indic and ASCII digits", () => {
    expect(parsePageInput("۳۷")).toBe(37);
    expect(parsePageInput("٣٧")).toBe(37);
    expect(parsePageInput(" 37 ")).toBe(37);
  });
  it("rejects non-numbers", () => {
    expect(parsePageInput("")).toBeNull();
    expect(parsePageInput("3a")).toBeNull();
    expect(parsePageInput("-2")).toBeNull();
  });
});

describe("rect conversion", () => {
  const page = { left: 100, top: 50, width: 400, height: 800 };

  it("converts client rects to page fractions", () => {
    const out = rectsToFractions([{ left: 140, top: 370, width: 200, height: 16 }], page);
    expect(out).toEqual([{ x: 0.1, y: 0.4, w: 0.5, h: 0.02 }]);
  });

  it("clips to the page and drops empty or outside rects", () => {
    const out = rectsToFractions(
      [
        { left: 50, top: 50, width: 100, height: 80 }, // half outside on the left
        { left: 600, top: 60, width: 10, height: 10 }, // fully outside
        { left: 200, top: 200, width: 0, height: 10 }, // empty
      ],
      page,
    );
    expect(out).toEqual([{ x: 0, y: 0, w: 0.125, h: 0.1 }]);
    expect(rectsToFractions([{ left: 1, top: 1, width: 1, height: 1 }], { ...page, width: 0 })).toEqual([]);
  });

  it("keeps at most 50 rects", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ left: 120, top: 60 + i * 10, width: 50, height: 8 }));
    expect(rectsToFractions(many, page)).toHaveLength(50);
  });

  it("round-trips fractions to pixels", () => {
    const [f] = rectsToFractions([{ left: 140, top: 370, width: 200, height: 16 }], page);
    expect(fractionToPixels(f!, 400, 800)).toEqual({ left: 40, top: 320, width: 200, height: 16 });
    // at a different zoom the same fractions scale
    expect(fractionToPixels(f!, 800, 1600)).toEqual({ left: 80, top: 640, width: 400, height: 32 });
  });
});

describe("mergeRects", () => {
  it("merges adjacent fragments on the same line", () => {
    const merged = mergeRects([
      { x: 0.5, y: 0.4, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.4, w: 0.2, h: 0.02 },
      { x: 0.3, y: 0.401, w: 0.2, h: 0.019 },
    ]);
    expect(merged).toEqual([{ x: 0.1, y: 0.4, w: 0.6, h: 0.02 }]);
  });
  it("keeps separate lines and distant fragments apart", () => {
    const merged = mergeRects([
      { x: 0.1, y: 0.4, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.43, w: 0.2, h: 0.02 },
      { x: 0.6, y: 0.4, w: 0.2, h: 0.02 },
    ]);
    expect(merged).toHaveLength(3);
  });
});

describe("pointInRects", () => {
  it("hit-tests fraction rects", () => {
    const rects = [{ x: 0.1, y: 0.4, w: 0.2, h: 0.02 }];
    expect(pointInRects(0.2, 0.41, rects)).toBe(true);
    expect(pointInRects(0.4, 0.41, rects)).toBe(false);
  });
});

describe("needsUrlRefresh", () => {
  const exp = "2026-10-02T19:05:00Z";
  const t = Date.parse(exp);
  it("refreshes 30s before expiry", () => {
    expect(needsUrlRefresh(exp, t - 60_000)).toBe(false);
    expect(needsUrlRefresh(exp, t - 30_000)).toBe(true);
    expect(needsUrlRefresh(exp, t + 1)).toBe(true);
  });
  it("treats unparseable dates as expired", () => {
    expect(needsUrlRefresh("not a date", t)).toBe(true);
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls once with the last args after the delay", () => {
    const fn = vi.fn();
    const d = debounce(fn, 1500);
    d(1);
    d(2);
    vi.advanceTimersByTime(1499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);
  });

  it("flushes and cancels", () => {
    const fn = vi.fn();
    const d = debounce(fn, 1500);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
    d(3);
    expect(d.pending()).toBe(true);
    d.flush();
    expect(fn).toHaveBeenCalledWith(3);
    expect(d.pending()).toBe(false);
    d(4);
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("groupHighlightsByPage", () => {
  const h = (id: number, page: number, created_at: string): Highlight => ({
    id,
    page,
    text: "",
    note: "",
    color: "yellow",
    rects: [],
    location: "",
    created_at,
    updated_at: created_at,
  });
  it("groups by page ascending, creation order within a page", () => {
    const groups = groupHighlightsByPage([h(1, 9, "2026-01-02"), h(2, 3, "2026-01-03"), h(3, 3, "2026-01-01")]);
    expect(groups.map((g) => g.page)).toEqual([3, 9]);
    expect(groups[0]!.items.map((x) => x.id)).toEqual([3, 2]);
  });
});

describe("HTTP client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps 401/403/404 to typed errors", () => {
    expect(errorForStatus(401)).toEqual({ kind: "auth" });
    expect(errorForStatus(403)).toEqual({ kind: "forbidden" });
    expect(errorForStatus(404)).toEqual({ kind: "no_ebook" });
    expect(errorForStatus(500)).toEqual({ kind: "http", status: 500 });
  });

  it("calls /library/<slug>/read/ with credentials and no cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getReaderSession("حقوق-مدنی");
    expect(res).toEqual({ ok: false, error: { kind: "forbidden" } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/library\/%D8%AD.*\/read\/$/);
    expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await saveProgress("x", { page: 2, total_pages: 9 })).toEqual({ ok: false, error: { kind: "network" } });
  });

  it("sends progress as PUT JSON", async () => {
    const body = { page: 2, total_pages: 9, percent: 22.22, location: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await saveProgress("x", { page: 2, total_pages: 9 }, { keepalive: true });
    expect(res).toEqual({ ok: true, data: body });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("PUT");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ location: "", page: 2, total_pages: 9 });
  });
});
