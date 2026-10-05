import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EPUB_SETTINGS,
  anchorElementId,
  buildCopyText,
  chapterForPage,
  findNthFolded,
  foldText,
  formatEpubPoint,
  formatEpubRange,
  isDeviceId,
  locationStart,
  offsetForPage,
  parseEpubHref,
  parseEpubLocation,
  sanitizeEpubSettings,
  uuidFromBytes,
  virtualPage,
} from "./reader-epub";
import { EPUB_FIXTURE, fixtureText } from "./reader-fixture-epub";
import { createBookmark, errorFromResponse, getReaderSession, listBookmarks, searchBook } from "./reader";

describe("foldText", () => {
  it("folds Arabic letters, digits and case one-to-one", () => {
    expect(foldText("كتاب علي")).toBe("کتاب علی");
    expect(foldText("موسى")).toBe("موسی");
    expect(foldText("ماده ۱۹۰ و ٢٣")).toBe("ماده 190 و 23");
    expect(foldText("Civil CODE")).toBe("civil code");
  });

  it("turns ZWNJ into a space and keeps the length", () => {
    expect(foldText("می‌شود")).toBe("می شود");
    for (const s of ["می‌شود", "İstanbul", "ﬀ ß", "۱۲۳"]) expect(foldText(s)).toHaveLength(s.length);
  });

  it("leaves characters whose lowercase is longer unchanged", () => {
    expect(foldText("İ")).toBe("İ");
  });
});

describe("findNthFolded", () => {
  const text = "ماده ۱۰ قانون مدني و ماده 10 و ماده ١٠";
  it("finds the nth folded occurrence with original offsets", () => {
    const first = findNthFolded(text, "ماده 10", 0)!;
    expect(text.slice(first.start, first.end)).toBe("ماده ۱۰");
    const second = findNthFolded(text, "  ماده ۱۰ ", 1)!;
    expect(text.slice(second.start, second.end)).toBe("ماده 10");
    const third = findNthFolded(text, "ماده ۱۰", 2)!;
    expect(text.slice(third.start, third.end)).toBe("ماده ١٠");
    expect(findNthFolded(text, "ماده ۱۰", 3)).toBeNull();
  });

  it("matches ي/ك and does not overlap", () => {
    expect(findNthFolded("قانون مدني", "مدنی", 0)).toEqual({ start: 6, end: 10 });
    expect(findNthFolded("aaaa", "aa", 1)).toEqual({ start: 2, end: 4 });
    expect(findNthFolded("aaaa", "aa", 2)).toBeNull();
  });

  it("rejects empty queries and negative n", () => {
    expect(findNthFolded("abc", "  ", 0)).toBeNull();
    expect(findNthFolded("abc", "a", -1)).toBeNull();
  });
});

describe("EPUB locations", () => {
  it("formats and parses points and ranges", () => {
    expect(formatEpubPoint(3, 120.7)).toBe("epub:3:120");
    expect(formatEpubRange(2, 50, 10)).toBe("epub:2:10-50");
    expect(parseEpubLocation("epub:3:120")).toEqual({ kind: "point", chapter: 3, offset: 120 });
    expect(parseEpubLocation("epub:2:10-50")).toEqual({ kind: "range", chapter: 2, start: 10, end: 50 });
    expect(locationStart(parseEpubLocation("epub:2:10-50")!)).toBe(10);
  });

  it("rejects PDF and malformed locations", () => {
    for (const bad of ["", "epub:", "epub:a:1", "epub:1:5-2", "epubcfi(/6/4)", "epub:1:2:3", null, undefined]) {
      expect(parseEpubLocation(bad)).toBeNull();
    }
  });

  it("parses internal links and maps anchors to prefixed ids", () => {
    expect(parseEpubHref("#epub:3:khiyarat")).toEqual({ chapter: 3, anchor: "khiyarat" });
    expect(parseEpubHref("#epub:0:")).toEqual({ chapter: 0, anchor: "" });
    expect(parseEpubHref("https://example.com")).toBeNull();
    expect(anchorElementId("s1")).toBe("epub-s1");
  });
});

describe("virtual pages", () => {
  const meta = { start_page: 12, pages: 5, chars: 6000 };
  it("maps offsets to pages within the chapter", () => {
    expect(virtualPage(meta, 0)).toBe(12);
    expect(virtualPage(meta, 1199)).toBe(12);
    expect(virtualPage(meta, 1200)).toBe(13);
    expect(virtualPage(meta, 5999)).toBe(16);
    expect(virtualPage(meta, 999_999)).toBe(16);
    expect(virtualPage({ start_page: 4, pages: 1, chars: 0 }, 50)).toBe(4);
  });

  it("finds the chapter of a page and the offset where a page starts", () => {
    const chapters = [
      { index: 0, title: "", start_page: 1, pages: 3, chars: 3000 },
      { index: 1, title: "", start_page: 4, pages: 2, chars: 2000 },
    ];
    expect(chapterForPage(chapters, 3)).toBe(0);
    expect(chapterForPage(chapters, 5)).toBe(1);
    expect(offsetForPage(meta, 14)).toBe(2400);
    expect(virtualPage(meta, offsetForPage(meta, 14))).toBe(14);
  });
});

describe("buildCopyText", () => {
  const book = { title: "قانون مدنی", authors: ["الف", "ب"] };
  it("appends the citation", () => {
    expect(buildCopyText("متن", 400, book)).toEqual({
      text: "متن\n\n— «قانون مدنی»، الف، ب، کتابفروشی دادرُز",
      truncated: false,
    });
  });

  it("truncates to the copy limit", () => {
    const out = buildCopyText("۱۲۳۴۵۶۷۸۹۰", 4, { title: "ک", authors: [] });
    expect(out).toEqual({ text: "۱۲۳۴…\n\n— «ک»، کتابفروشی دادرُز", truncated: true });
  });
});

describe("settings and device ids", () => {
  it("sanitizes saved settings", () => {
    expect(sanitizeEpubSettings(null)).toEqual(DEFAULT_EPUB_SETTINGS);
    expect(DEFAULT_EPUB_SETTINGS.justify).toBe(false);
    expect(sanitizeEpubSettings({ fontSize: 6, lineHeight: 9, margin: 0, justify: true })).toEqual({
      ...DEFAULT_EPUB_SETTINGS,
      fontSize: 6,
      margin: 0,
      justify: true,
    });
  });

  it("builds RFC 4122 v4 ids from bytes", () => {
    const id = uuidFromBytes(new Uint8Array(16).fill(255));
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(isDeviceId(id)).toBe(true);
    expect(isDeviceId("nope")).toBe(false);
  });
});

describe("fixture chapters", () => {
  it("are consistent with their metadata", () => {
    const { info, chapters } = EPUB_FIXTURE;
    expect(chapters.length).toBeGreaterThanOrEqual(3);
    expect(info.total_pages).toBe(chapters.reduce((n, c) => n + c.pages, 0));
    for (const c of chapters) expect(fixtureText(c.html)).toHaveLength(c.chars);
    for (const t of info.toc) {
      if (t.anchor) expect(chapters[t.chapter]!.html).toContain(`id="${anchorElementId(t.anchor)}"`);
    }
  });
});

describe("Phase 6 client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps 409 device_limit and 429", () => {
    const devices = [{ id: 1, label: "Chrome", last_seen: "", current: false }];
    expect(errorFromResponse(409, { code: "device_limit", devices })).toEqual({ kind: "device_limit", devices });
    expect(errorFromResponse(409, {})).toEqual({ kind: "http", status: 409 });
    expect(errorFromResponse(429, {})).toEqual({ kind: "throttled" });
  });

  it("sends the device header and reads the device list from a 409", async () => {
    const devices = [{ id: 7, label: "Safari", last_seen: "", current: false }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: "device_limit", detail: "x", devices }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getReaderSession("x");
    expect(res).toEqual({ ok: false, error: { kind: "device_limit", devices } });
    const headers = new Headers(fetchMock.mock.calls[0]![1].headers);
    expect(isDeviceId(headers.get("X-Reader-Device"))).toBe(true);
    // the same id on every call
    await getReaderSession("x");
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get("X-Reader-Device")).toBe(headers.get("X-Reader-Device"));
  });

  it("skips search requests shorter than two characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchBook("x", " ا ")).toEqual({ ok: true, data: { results: [], truncated: false } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fixture mode: search finds folded matches and bookmarks dedupe", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    const res = await searchBook("epub-sample", "ماده 190");
    expect(res.ok && res.data.results.length).toBeGreaterThan(0);
    const a = await createBookmark("epub-sample", { page: 2, location: "epub:1:10" });
    const b = await createBookmark("epub-sample", { page: 2, location: "epub:1:10" });
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
    const list = await listBookmarks("epub-sample");
    expect(list.ok && list.data.length).toBe(1);
  });
});
