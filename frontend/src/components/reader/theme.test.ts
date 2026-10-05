import { afterEach, describe, expect, it, vi } from "vitest";
import { READER_THEME_KEY, initialReaderTheme, isReaderTheme, loadReaderTheme, saveReaderTheme } from "./theme";
import { isFinished, isInProgress, mostRecentInProgress } from "@/components/account/ReadingProgressMeter";

/** `storage` is a fake Storage, or a function that throws (blocked storage, private mode). */
function fakeWindow(storage: Partial<Storage> | (() => never), dark = false) {
  vi.stubGlobal("window", {
    get localStorage() {
      return typeof storage === "function" ? storage() : storage;
    },
    matchMedia: () => ({ matches: dark }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("reader theme", () => {
  it("validates values", () => {
    expect(isReaderTheme("sepia")).toBe(true);
    expect(isReaderTheme("blue")).toBe(false);
    expect(isReaderTheme(null)).toBe(false);
  });

  it("saves and loads through localStorage", () => {
    const store = new Map<string, string>();
    fakeWindow({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    saveReaderTheme("dark");
    expect(store.get(READER_THEME_KEY)).toBe("dark");
    expect(loadReaderTheme()).toBe("dark");
    store.set(READER_THEME_KEY, "neon");
    expect(loadReaderTheme()).toBeNull();
  });

  it("survives blocked storage and follows the system preference first time", () => {
    fakeWindow(() => {
      throw new Error("SecurityError");
    }, true);
    expect(() => saveReaderTheme("sepia")).not.toThrow();
    expect(loadReaderTheme()).toBeNull();
    expect(initialReaderTheme()).toBe("dark");
  });
});

describe("library progress helpers", () => {
  const p = (page: number, total: number, at: string) => ({ percent: (page * 100) / total, page, total_pages: total, updated_at: at });

  it("classifies progress", () => {
    expect(isInProgress(p(3, 10, "2026-01-01T00:00:00Z"))).toBe(true);
    expect(isInProgress(p(10, 10, "2026-01-01T00:00:00Z"))).toBe(false);
    expect(isFinished(p(10, 10, "2026-01-01T00:00:00Z"))).toBe(true);
    expect(isInProgress(null)).toBe(false);
  });

  it("picks the most recently read unfinished, readable book", () => {
    const entries = [
      { id: "old", can_read: true, progress: p(2, 10, "2026-09-01T00:00:00Z") },
      { id: "done", can_read: true, progress: p(10, 10, "2026-10-04T00:00:00Z") },
      { id: "revoked", can_read: false, progress: p(5, 10, "2026-10-05T00:00:00Z") },
      { id: "recent", can_read: true, progress: p(4, 10, "2026-10-03T00:00:00Z") },
      { id: "never", can_read: true, progress: null },
    ];
    expect(mostRecentInProgress(entries)?.id).toBe("recent");
    expect(mostRecentInProgress([{ can_read: true, progress: null }])).toBeNull();
  });
});
