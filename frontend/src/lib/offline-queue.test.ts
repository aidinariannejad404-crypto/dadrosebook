import { afterEach, describe, expect, it, vi } from "vitest";
import { applyIdMap, enqueueOp, localHighlight, replayOps, tempId, type OpExecutor, type OpResult, type QueuedOp } from "./offline-queue";
import { isOfflinePackage, opResult, sessionFromOffline } from "./reader-offline";
import { errorFromResponse, getReaderSession, getChapter, requestOfflineCopy } from "./reader";
import { searchChapterTexts } from "./reader-epub";
import { loadedShellAssets } from "./reader-sw";
import { EPUB_FIXTURE, fixtureText } from "./reader-fixture-epub";
import type { Bookmark, Highlight } from "./types";

const hlBody = { page: 2, text: "عقد", rects: [], color: "yellow" as const, note: "", location: "epub:1:0-3" };

describe("enqueueOp", () => {
  it("keeps only the latest progress and sums copies", () => {
    let q: QueuedOp[] = [];
    q = enqueueOp(q, { kind: "progress", body: { page: 1, total_pages: 9, location: "epub:0:0" } });
    q = enqueueOp(q, { kind: "copy", chars: 10 });
    q = enqueueOp(q, { kind: "progress", body: { page: 3, total_pages: 9, location: "epub:1:5" } });
    q = enqueueOp(q, { kind: "copy", chars: 5 });
    q = enqueueOp(q, { kind: "copy", chars: 0 });
    expect(q).toEqual([
      { kind: "copy", chars: 15 },
      { kind: "progress", body: { page: 3, total_pages: 9, location: "epub:1:5" } },
    ]);
  });

  it("folds edits and deletes of offline-created objects into their create", () => {
    let q: QueuedOp[] = [];
    q = enqueueOp(q, { kind: "highlight-create", tempId: -1, body: hlBody });
    q = enqueueOp(q, { kind: "highlight-update", id: -1, body: { note: "مهم", color: "pink" } });
    expect(q).toEqual([{ kind: "highlight-create", tempId: -1, body: { ...hlBody, note: "مهم", color: "pink" } }]);
    q = enqueueOp(q, { kind: "highlight-delete", id: -1 });
    expect(q).toEqual([]);
    q = enqueueOp(q, { kind: "bookmark-create", tempId: -2, body: { page: 1, location: "epub:0:0", label: "" } });
    q = enqueueOp(q, { kind: "bookmark-delete", id: -2 });
    expect(q).toEqual([]);
  });

  it("merges updates of a server object and drops them when it is deleted", () => {
    let q: QueuedOp[] = [];
    q = enqueueOp(q, { kind: "highlight-update", id: 7, body: { note: "a" } });
    q = enqueueOp(q, { kind: "highlight-update", id: 7, body: { color: "blue" } });
    expect(q).toEqual([{ kind: "highlight-update", id: 7, body: { note: "a", color: "blue" } }]);
    q = enqueueOp(q, { kind: "highlight-delete", id: 7 });
    expect(q).toEqual([{ kind: "highlight-delete", id: 7 }]);
  });

  it("temp ids are negative and unique", () => {
    const a = tempId(1000);
    const b = tempId(1000);
    expect(a).toBeLessThan(0);
    expect(b).not.toBe(a);
  });
});

function executor(answers: Partial<Record<keyof OpExecutor, OpResult<unknown>[]>>, log: string[]): OpExecutor {
  const next = (k: keyof OpExecutor) => async () => {
    log.push(k);
    return (answers[k]?.shift() ?? { status: "done" }) as OpResult<never>;
  };
  return {
    progress: next("progress"),
    createHighlight: next("createHighlight"),
    updateHighlight: next("updateHighlight"),
    deleteHighlight: next("deleteHighlight"),
    createBookmark: next("createBookmark"),
    deleteBookmark: next("deleteBookmark"),
    copy: next("copy"),
  };
}

describe("replayOps", () => {
  const server: Highlight = { ...localHighlight(41, hlBody, "2026-10-05T00:00:00Z") };
  const ops: QueuedOp[] = [
    { kind: "highlight-create", tempId: -5, body: hlBody },
    { kind: "bookmark-delete", id: 3 },
    { kind: "copy", chars: 20 },
    { kind: "progress", body: { page: 4, total_pages: 9, location: "epub:2:0" } },
  ];

  it("sends in order and maps temporary ids", async () => {
    const log: string[] = [];
    const out = await replayOps(ops, executor({ createHighlight: [{ status: "done", data: server }] }, log));
    expect(log).toEqual(["createHighlight", "deleteBookmark", "copy", "progress"]);
    expect(out.remaining).toEqual([]);
    expect(out.sent).toBe(4);
    expect(out.highlights.get(-5)).toEqual(server);
  });

  it("stops at the first retry and keeps the rest; drops refused ops", async () => {
    const log: string[] = [];
    const out = await replayOps(ops, executor({ deleteBookmark: [{ status: "drop" }], copy: [{ status: "retry" }] }, log));
    expect(log).toEqual(["createHighlight", "deleteBookmark", "copy"]);
    expect(out.remaining).toEqual(ops.slice(2));
  });

  it("a thrown error counts as retry", async () => {
    const exec = executor({}, []);
    exec.createHighlight = async () => {
      throw new Error("boom");
    };
    expect((await replayOps(ops, exec)).remaining).toEqual(ops);
  });

  it("applyIdMap replaces temporary objects and removes refused ones", () => {
    const temp = localHighlight(-5, hlBody, "x");
    const gone = localHighlight(-6, hlBody, "x");
    const keep = localHighlight(9, hlBody, "x");
    const map = new Map<number, Highlight | null>([
      [-5, server],
      [-6, null],
    ]);
    expect(applyIdMap([keep, temp, gone], map).map((h) => h.id)).toEqual([9, 41]);
    const bms: Bookmark[] = [{ id: 1, page: 1, location: "", label: "", created_at: "" }];
    expect(applyIdMap(bms, new Map())).toEqual(bms);
  });
});

describe("offline helpers", () => {
  const pkg = {
    epub: EPUB_FIXTURE.info,
    chapters: EPUB_FIXTURE.chapters,
    watermark: "0912***4567",
    copy_limit: 1000,
    copy_quota: { limit: 2000, used: 10 },
  };

  it("validates packages", () => {
    expect(isOfflinePackage(pkg)).toBe(true);
    expect(isOfflinePackage({ ...pkg, chapters: [] })).toBe(false);
    expect(isOfflinePackage({ ...pkg, chapters: [{ index: 0 }] })).toBe(false);
    expect(isOfflinePackage(null)).toBe(false);
  });

  it("builds a reader session from the local copy", () => {
    const s = sessionFromOffline(
      "epub-sample",
      { license: { id: 5, book: "epub-sample", title: "ق", expires_at: "2026-10-19T00:00:00Z" } },
      { book: { slug: "x", title: "ق", subtitle: "", cover: null, authors: ["الف"], subjects: [] }, package: pkg },
      { progress: null, highlights: [], bookmarks: [], copy_quota: { limit: 2000, used: 99 }, updatedAt: "" },
    );
    expect(s.book.slug).toBe("epub-sample");
    expect(s.file.format).toBe("EPUB");
    expect(s.epub).toBe(pkg.epub);
    expect(s.copy_quota).toEqual({ limit: 2000, used: 99 });
    expect(s.offline?.license?.id).toBe(5);
  });

  it("maps answers to replay outcomes", () => {
    expect(opResult({ ok: true, data: 1 })).toEqual({ status: "done", data: 1 });
    expect(opResult({ ok: false, error: { kind: "network" } }).status).toBe("retry");
    expect(opResult({ ok: false, error: { kind: "throttled" } }).status).toBe("retry");
    expect(opResult({ ok: false, error: { kind: "http", status: 503 } }).status).toBe("retry");
    expect(opResult({ ok: false, error: { kind: "forbidden" } }).status).toBe("drop");
    expect(opResult({ ok: false, error: { kind: "http", status: 400 } }).status).toBe("drop");
  });

  it("409 offline_limit carries the licenses", () => {
    const licenses = [{ id: 1, book: "a", title: "A", device_label: "x", expires_at: "", created_at: "" }];
    expect(errorFromResponse(409, { code: "offline_limit", licenses })).toEqual({ kind: "offline_limit", licenses });
  });

  it("searches chapter texts with folding, like the server", () => {
    const texts = EPUB_FIXTURE.chapters.map((c) => ({ index: c.index, title: c.title, text: fixtureText(c.html) }));
    const res = searchChapterTexts(texts, "ماده 190");
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.match).toBe("ماده ۱۹۰");
    expect(searchChapterTexts(texts, "   ").results).toEqual([]);
    const many = searchChapterTexts([{ index: 0, title: "t", text: "اب ".repeat(150) }], "اب");
    expect(many.results).toHaveLength(100);
    expect(many.truncated).toBe(true);
  });

  it("collects same-origin static assets for the shell, never /api", () => {
    const origin = "https://dadrosebook.ir";
    const list = loadedShellAssets(
      [
        { name: `${origin}/_next/static/chunks/app.js` },
        { name: `${origin}/_next/static/media/Vazirmatn.woff2` },
        { name: `${origin}/api/v1/library/x/read/` },
        { name: "https://cdn.example.com/_next/static/x.js" },
        { name: `${origin}/fixtures/reader-sample.pdf` },
      ],
      origin,
    );
    expect(list).toEqual(["/_next/static/chunks/app.js", "/_next/static/media/Vazirmatn.woff2"]);
  });
});

describe("fixture mode offline endpoints", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("POST offline returns the fixture EPUB as a package; the session advertises offline", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    const res = await requestOfflineCopy("epub-sample");
    expect(res.ok && isOfflinePackage(res.data.package)).toBe(true);
    expect(res.ok && res.data.license.book).toBe("epub-sample");
    const session = await getReaderSession("epub-sample");
    expect(session.ok && session.data.offline?.max_books).toBe(3);
    const pdf = await getReaderSession("pdf-sample");
    expect(pdf.ok && pdf.data.offline).toBeNull();
  });

  it("simulates a network error when the browser is offline", async () => {
    vi.stubEnv("NEXT_PUBLIC_READER_FIXTURE", "1");
    vi.stubGlobal("navigator", { onLine: false });
    expect(await getChapter("epub-sample", 0)).toEqual({ ok: false, error: { kind: "network" } });
    expect(await getReaderSession("epub-sample")).toEqual({ ok: false, error: { kind: "network" } });
  });
});
