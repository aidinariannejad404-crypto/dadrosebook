import { describe, expect, it, vi } from "vitest";
import {
  GUEST_WISHLIST_KEY,
  GUEST_WISHLIST_MAX,
  mergeGuestWishlist,
  parseGuestIds,
  readGuestIds,
  setGuestHeart,
  toggleGuestId,
} from "./guest-wishlist";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("guest wishlist", () => {
  it("parses defensively", () => {
    expect(parseGuestIds(null)).toEqual([]);
    expect(parseGuestIds("nope")).toEqual([]);
    expect(parseGuestIds("[3, 3, -1, 1.5, \"2\", 7]")).toEqual([3, 7]);
  });

  it("toggles newest first and caps the list", () => {
    expect(toggleGuestId([1, 2], 3, true)).toEqual([3, 1, 2]);
    expect(toggleGuestId([1, 2], 1, true)).toEqual([1, 2]);
    expect(toggleGuestId([1, 2], 1, false)).toEqual([2]);
    const many = Array.from({ length: GUEST_WISHLIST_MAX }, (_, i) => i + 1);
    expect(toggleGuestId(many, 999, true)).toHaveLength(GUEST_WISHLIST_MAX);
  });

  it("persists and clears the key when empty", () => {
    const store = memoryStore();
    expect(setGuestHeart(5, true, store)).toEqual([5]);
    expect(readGuestIds(store)).toEqual([5]);
    setGuestHeart(5, false, store);
    expect(store.data.has(GUEST_WISHLIST_KEY)).toBe(false);
  });
});

describe("mergeGuestWishlist", () => {
  it("posts the ids once and clears them on success", async () => {
    const store = memoryStore();
    setGuestHeart(4, true, store);
    setGuestHeart(9, true, store);
    const post = vi.fn().mockResolvedValue({ ok: true });
    expect(await mergeGuestWishlist(post, store)).toBe(true);
    expect(post).toHaveBeenCalledWith([9, 4]);
    expect(readGuestIds(store)).toEqual([]);
    expect(await mergeGuestWishlist(post, store)).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("keeps the ids when the request fails", async () => {
    const store = memoryStore();
    setGuestHeart(4, true, store);
    expect(await mergeGuestWishlist(vi.fn().mockResolvedValue({ ok: false }), store)).toBe(false);
    expect(await mergeGuestWishlist(vi.fn().mockRejectedValue(new Error("x")), store)).toBe(false);
    expect(readGuestIds(store)).toEqual([4]);
  });
});
