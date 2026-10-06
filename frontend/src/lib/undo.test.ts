import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNDO_MS, createUndoStore } from "./undo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("undo store", () => {
  it("keeps an entry for 6 s, then expires it", () => {
    const onExpire = vi.fn();
    const store = createUndoStore<string>({ onExpire });
    const listener = vi.fn();
    store.subscribe(listener);
    store.push("a", "line A");
    expect(store.getSnapshot().map((e) => e.key)).toEqual(["a"]);
    expect(UNDO_MS).toBe(6000);
    vi.advanceTimersByTime(5999);
    expect(store.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toHaveLength(0);
    expect(onExpire).toHaveBeenCalledWith(expect.objectContaining({ key: "a", value: "line A" }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("undo returns the value once and cancels the timer", () => {
    const onExpire = vi.fn();
    const store = createUndoStore<number>({ onExpire });
    store.push("x", 42);
    expect(store.undo("x")).toBe(42);
    expect(store.undo("x")).toBeNull();
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("re-pushing a key restarts its timer; dismiss expires now", () => {
    const onExpire = vi.fn();
    const store = createUndoStore<number>({ duration: 1000, onExpire, now: () => 0 });
    store.push("k", 1);
    vi.advanceTimersByTime(800);
    store.push("k", 2);
    vi.advanceTimersByTime(800);
    expect(store.getSnapshot()).toEqual([{ key: "k", value: 2, expiresAt: 1000 }]);
    store.push("j", 3);
    store.dismiss("j");
    expect(onExpire).toHaveBeenCalledTimes(1);
    store.dispose();
    vi.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
