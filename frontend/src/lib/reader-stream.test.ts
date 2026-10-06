import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetAnalyticsForTests,
  trackFreeEbookClaimed,
  trackQuoteCardShared,
  trackReaderProblemReported,
  trackReaderSampleOpened,
  trackSampleCtaClick,
  type AnalyticsDetail,
} from "./analytics";
import { compactText, locateInChunks, relocatedHint, splitRelocated } from "./reader-anchor";
import {
  PROBLEM_DESCRIPTION_MAX,
  PROBLEM_KINDS,
  buyHref,
  deviceLabel,
  problemFormError,
  sampleHref,
  sampleShare,
} from "./reader-stream";

describe("ه۱ reader-anchor", () => {
  it("compacts like the server: folded, no spaces/ZWNJ/tatweel", () => {
    expect(compactText("مي‌شود  ـ ۱۲")).toBe("میشود12");
    expect(compactText("ABC def")).toBe("abcdef");
  });

  it("finds a quote across text-layer chunks despite different spacing", () => {
    const chunks = ["ماده ۱۰ - ", "قراردادهای خصوصی", " نسبت به کسانی که آن را منعقد نموده‌اند"];
    const hit = locateInChunks(chunks, "قراردادهای  خصوصي نسبت");
    expect(hit).toEqual({ start: { chunk: 1, offset: 0 }, end: { chunk: 2, offset: 5 } });
  });

  it("prefers the occurrence whose preceding text matches", () => {
    const chunks = ["الف: متن تکراری. ", "ب: متن تکراری."];
    expect(locateInChunks(chunks, "متن تکراری")!.start.chunk).toBe(0);
    expect(locateInChunks(chunks, "متن تکراری", "ب:")!.start).toEqual({ chunk: 1, offset: 3 });
  });

  it("returns null when absent or empty", () => {
    expect(locateInChunks(["چیزی دیگر"], "قانون")).toBeNull();
    expect(locateInChunks(["x"], "  ")).toBeNull();
  });

  it("splits relocated items and explains where they were", () => {
    const items = [
      { id: 1, anchor_status: "anchored" as const, page: 3, previous_page: null },
      { id: 2, anchor_status: "orphaned" as const, page: 4, previous_page: 12 },
      { id: 3, page: 5, previous_page: null },
    ];
    const { placed, relocated } = splitRelocated(items);
    expect(placed.map((i) => i.id)).toEqual([1, 3]);
    expect(relocated.map((i) => i.id)).toEqual([2]);
    expect(relocatedHint(items[1]!, String)).toBe("در نسخه قبلی: صفحه 12");
    expect(relocatedHint({ page: 0, previous_page: null }, String)).toBe("در نسخه قبلی");
  });
});

describe("د۵ sample helpers", () => {
  it("links to the sample reader and quick buy", () => {
    expect(sampleHref("قانون مدنی")).toBe(`/read/${encodeURIComponent("قانون مدنی")}?sample=1`);
    expect(buyHref(12)).toBe("/checkout?variant=12");
  });

  it("reports the sample share", () => {
    expect(sampleShare({ sample_pages: 3, total_pages: 28 })).toBe(11);
    expect(sampleShare({ sample_pages: 5, total_pages: 0 })).toBe(0);
    expect(sampleShare({ sample_pages: 9, total_pages: 4 })).toBe(100);
  });
});

describe("ه۸ problem report helpers", () => {
  it("has the four kinds", () => {
    expect(PROBLEM_KINDS.map((k) => k.value)).toEqual(["typo", "missing_page", "display", "other"]);
  });

  it("validates like the server", () => {
    expect(problemFormError(null, "")).toBe("نوع مشکل را انتخاب کنید.");
    expect(problemFormError("other", "   ")).toBe("مشکل را کوتاه توضیح دهید.");
    expect(problemFormError("other", "صفحه سفید است")).toBeNull();
    expect(problemFormError("typo", "")).toBeNull();
    expect(problemFormError("typo", "x".repeat(PROBLEM_DESCRIPTION_MAX + 1))).toBe("توضیح بیش از حد طولانی است.");
  });

  it("labels the device without the full user agent", () => {
    const android =
      "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
    expect(deviceLabel(android)).toBe("Chrome · Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit Version/17.5 Mobile Safari/604.1")).toBe(
      "Safari · iPhone",
    );
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox · Windows");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 13) SamsungBrowser/25.0 Chrome/121 Safari/537")).toBe(
      "Samsung Internet · Android",
    );
    expect(deviceLabel("")).toBe("مرورگر");
  });
});

describe("reader stream analytics", () => {
  let events: AnalyticsDetail[];

  beforeEach(() => {
    const win = Object.assign(new EventTarget(), {
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    events = [];
    win.addEventListener("dadrose:analytics", (e) => events.push((e as CustomEvent<AnalyticsDetail>).detail));
    vi.stubGlobal("window", win);
    _resetAnalyticsForTests();
  });

  afterEach(() => {
    _resetAnalyticsForTests();
    vi.unstubAllGlobals();
  });

  it("sends the reader stream events with their params", () => {
    trackReaderSampleOpened({ book: "civil", format: "EPUB", pages: 3 });
    trackSampleCtaClick({ book: "civil", variant: "EBOOK", price: 185_000 });
    trackFreeEbookClaimed({ book: "statute", created: true });
    trackReaderProblemReported({ book: "civil", kind: "typo", format: "PDF" });
    trackQuoteCardShared({ book: "civil", chars: 120, method: "downloaded" });
    expect(events.map((e) => e.event)).toEqual([
      "reader_sample_opened",
      "sample_cta_click",
      "free_ebook_claimed",
      "reader_problem_reported",
      "quote_card_shared",
    ]);
    expect(events[0]!.params).toMatchObject({ book: "civil", format: "EPUB", pages: 3 });
    expect(events[1]!.params).toMatchObject({ book: "civil", variant: "EBOOK", price: 185_000 });
    expect(events[4]!.params).toMatchObject({ chars: 120, method: "downloaded" });
  });
});
