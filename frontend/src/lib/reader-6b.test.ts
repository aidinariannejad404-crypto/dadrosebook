import { afterEach, describe, expect, it, vi } from "vitest";
import {
  citationLine,
  columnCount,
  columnPage,
  defaultReadingMode,
  pagedGeometry,
  planCopy,
  quotaAfterCopy,
  quotaRemaining,
  relativeColumn,
  sanitizeEpubSettings,
} from "./reader-epub";
import { exportNotes, filenameFromDisposition, getReaderSession, listDevices, notesFallbackName, recordCopy, removeDevice } from "./reader";

const book = { title: "ک", authors: [] as string[] };
const cite = "— «ک»، کتابفروشی دادرُز";

describe("planCopy (Phase 6b copy quota)", () => {
  it("copies in full when both caps allow it", () => {
    expect(planCopy("متن کوتاه", 1000, { limit: 12000, used: 340 }, book)).toEqual({
      text: `متن کوتاه\n\n${cite}`,
      chars: 9,
      truncated: false,
      exhausted: false,
      limitedBy: null,
    });
  });

  it("cuts to the per-copy limit when that is smaller", () => {
    const p = planCopy("۱۲۳۴۵۶۷۸۹۰", 4, { limit: 12000, used: 0 }, book);
    expect(p).toMatchObject({ text: `۱۲۳۴…\n\n${cite}`, chars: 4, truncated: true, limitedBy: "copy" });
  });

  it("cuts to the remaining quota (limit − used) when that is smaller", () => {
    const p = planCopy("a".repeat(500), 1000, { limit: 2000, used: 1900 }, book);
    expect(p.chars).toBe(100);
    expect(p.limitedBy).toBe("quota");
    expect(p.text.startsWith(`${"a".repeat(100)}…\n\n`)).toBe(true);
  });

  it("puts only the citation on the clipboard once the quota is used up", () => {
    for (const used of [2000, 2500]) {
      expect(planCopy("متن", 1000, { limit: 2000, used }, book)).toEqual({
        text: cite,
        chars: 0,
        truncated: true,
        exhausted: true,
        limitedBy: "quota",
      });
    }
  });

  it("ignores the quota when the server sent none", () => {
    expect(planCopy("abc", 2, null, book)).toMatchObject({ chars: 2, limitedBy: "copy", exhausted: false });
    expect(quotaRemaining(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it("does not count whitespace trimmed at the cut", () => {
    expect(planCopy("ab   cd", 4, { limit: 10, used: 0 }, book).chars).toBe(2);
  });

  it("tracks used characters", () => {
    expect(quotaRemaining({ limit: 2000, used: 1900 })).toBe(100);
    expect(quotaRemaining({ limit: 2000, used: 2100 })).toBe(0);
    expect(quotaAfterCopy({ limit: 2000, used: 1900 }, 150)).toEqual({ limit: 2000, used: 2000 });
    expect(quotaAfterCopy({ limit: 2000, used: 10 }, 5)).toEqual({ limit: 2000, used: 15 });
  });

  it("builds the citation line", () => {
    expect(citationLine({ title: "قانون مدنی", authors: ["الف", "ب"] })).toBe("— «قانون مدنی»، الف، ب، کتابفروشی دادرُز");
  });
});

describe("paged mode helpers", () => {
  it("defaults to paged from 768px, scroll below", () => {
    expect(defaultReadingMode(360)).toBe("scroll");
    expect(defaultReadingMode(767)).toBe("scroll");
    expect(defaultReadingMode(768)).toBe("paged");
    expect(defaultReadingMode(1280)).toBe("paged");
  });

  it("keeps the saved mode and drops invalid ones", () => {
    expect(sanitizeEpubSettings({ mode: "paged" }).mode).toBe("paged");
    expect(sanitizeEpubSettings({ mode: "scroll" }).mode).toBe("scroll");
    expect(sanitizeEpubSettings({ mode: "spread" }).mode).toBeUndefined();
  });

  it("sizes one column to the text width, gap = 2 × padding", () => {
    expect(pagedGeometry({ width: 360, height: 700 }, { fontPx: 18, maxEm: 34, padding: 20, padBlock: 20 })).toEqual({
      colWidth: 320,
      gap: 40,
      stride: 360,
      height: 660,
    });
    // wide screens: the line length caps the column
    expect(pagedGeometry({ width: 1280, height: 700 }, { fontPx: 18, maxEm: 34, padding: 20, padBlock: 20 }).colWidth).toBe(612);
  });

  it("counts columns from the scroll width", () => {
    expect(columnCount(320, 320, 40)).toBe(1);
    expect(columnCount(320 * 3 + 40 * 2, 320, 40)).toBe(3);
    expect(columnCount(0, 320, 40)).toBe(1);
  });

  it("finds the column of a point for RTL and LTR books", () => {
    const frame = { left: 20, right: 340 };
    expect(relativeColumn(180, frame, 360, true)).toBe(0);
    expect(relativeColumn(180 - 360, frame, 360, true)).toBe(1); // RTL: next page is to the left
    expect(relativeColumn(180 + 360, frame, 360, true)).toBe(-1);
    expect(relativeColumn(180 + 360, frame, 360, false)).toBe(1); // LTR: next page is to the right
  });

  it("maps a column onto the chapter's virtual pages", () => {
    const meta = { start_page: 10, pages: 4 };
    expect(columnPage(meta, 0, 8)).toBe(10);
    expect(columnPage(meta, 1, 8)).toBe(10);
    expect(columnPage(meta, 2, 8)).toBe(11);
    expect(columnPage(meta, 7, 8)).toBe(13);
    expect(columnPage(meta, 99, 8)).toBe(13);
    // fewer columns than virtual pages
    expect(columnPage(meta, 1, 2)).toBe(12);
  });
});

describe("notebook export file names", () => {
  const fb = notesFallbackName("قانون-مدنی", "md");
  it("falls back to دفترچه-یادداشت-<slug>.<ext>", () => {
    expect(fb).toBe("دفترچه-یادداشت-قانون-مدنی.md");
    expect(filenameFromDisposition(null, fb)).toBe(fb);
    expect(filenameFromDisposition("attachment", fb)).toBe(fb);
  });

  it("prefers the RFC 5987 name, else the quoted one", () => {
    const encoded = encodeURIComponent("یادداشت‌ها-قانون.md");
    expect(filenameFromDisposition(`attachment; filename="notes.md"; filename*=UTF-8''${encoded}`, fb)).toBe("یادداشت‌ها-قانون.md");
    expect(filenameFromDisposition('attachment; filename="notes-1.html"', fb)).toBe("notes-1.html");
    expect(filenameFromDisposition("attachment; filename=notes.md", fb)).toBe("notes.md");
  });

  it("drops path separators", () => {
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', fb)).toBe("etcpasswd");
  });
});

describe("fixture mode (NEXT_PUBLIC_READER_FIXTURE=1)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves a nearly used-up copy quota and grants only what is left", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    const s = await getReaderSession("quota-sample");
    expect(s.ok && s.data.copy_quota).toEqual({ limit: 2000, used: 1900 });
    const r = await recordCopy("quota-sample", 150);
    expect(r.ok && r.data).toEqual({ limit: 2000, used: 2000, granted: 100 });
  });

  it("lists devices with the current one and removes them", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    const before = await listDevices();
    expect(before.ok && before.data.filter((d) => d.current)).toHaveLength(1);
    const victim = before.ok ? before.data.find((d) => !d.current)! : null;
    await removeDevice(victim!.id);
    const after = await listDevices();
    expect(after.ok && after.data.some((d) => d.id === victim!.id)).toBe(false);
  });

  it("generates a local notebook file", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    const md = await exportNotes("epub-sample", "md");
    expect(md.ok && md.data.filename).toBe("دفترچه-یادداشت-epub-sample.md");
    expect(md.ok && (await md.data.blob.text())).toContain("# دفترچه یادداشت");
    const html = await exportNotes("epub-sample", "html");
    expect(html.ok && (await html.data.blob.text())).toContain('dir="rtl"');
  });
});
