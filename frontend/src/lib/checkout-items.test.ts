import { describe, expect, it, vi } from "vitest";
import {
  itemsKey,
  normalizeItems,
  parseCartResponse,
  parseItemsFromSearch,
  resolveCheckoutItems,
} from "./checkout-items";

describe("parseItemsFromSearch", () => {
  it("reads one variant with default qty", () => {
    expect(parseItemsFromSearch("?variant=10")).toEqual([{ variant_id: 10, quantity: 1 }]);
  });
  it("pairs repeated variant and qty by position", () => {
    expect(parseItemsFromSearch("variant=10&qty=2&variant=11&qty=3")).toEqual([
      { variant_id: 10, quantity: 2 },
      { variant_id: 11, quantity: 3 },
    ]);
  });
  it("skips invalid ids, defaults bad qty and merges duplicates", () => {
    expect(parseItemsFromSearch("variant=abc&variant=0&variant=5&qty=x&variant=5&qty=-1")).toEqual([
      { variant_id: 5, quantity: 2 },
    ]);
  });
  it("clamps quantities and lines", () => {
    expect(parseItemsFromSearch("variant=1&qty=99")).toEqual([{ variant_id: 1, quantity: 20 }]);
    const many = Array.from({ length: 40 }, (_, i) => `variant=${i + 1}`).join("&");
    expect(parseItemsFromSearch(many)).toHaveLength(30);
  });
  it("is empty without params", () => {
    expect(parseItemsFromSearch(new URLSearchParams())).toEqual([]);
  });
});

describe("parseCartResponse", () => {
  it("accepts nested variant objects", () => {
    expect(parseCartResponse({ items: [{ variant: { id: 3 }, quantity: 2 }] })).toEqual([{ variant_id: 3, quantity: 2 }]);
  });
  it("accepts variant_id", () => {
    expect(parseCartResponse({ items: [{ variant_id: 4, quantity: 1 }, { foo: 1 }] })).toEqual([
      { variant_id: 4, quantity: 1 },
    ]);
  });
  it("skips unavailable Phase 2 cart lines", () => {
    expect(
      parseCartResponse({
        token: "t",
        items: [
          { id: 1, variant: { id: 3 }, quantity: 2, is_available: true, issue: null },
          { id: 2, variant: { id: 4 }, quantity: 1, is_available: false, issue: "out_of_stock" },
        ],
      }),
    ).toEqual([{ variant_id: 3, quantity: 2 }]);
  });
  it("rejects unknown shapes", () => {
    expect(parseCartResponse(null)).toBeNull();
    expect(parseCartResponse({ lines: [] })).toBeNull();
    expect(parseCartResponse("x")).toBeNull();
  });
});

describe("resolveCheckoutItems", () => {
  it("prefers URL items and does not touch the cart", async () => {
    const cart = vi.fn(async () => [{ variant_id: 9, quantity: 1 }]);
    expect(await resolveCheckoutItems("variant=1", cart)).toEqual({ items: [{ variant_id: 1, quantity: 1 }], source: "url" });
    expect(cart).not.toHaveBeenCalled();
  });
  it("falls back to the cart, then to nothing", async () => {
    expect(await resolveCheckoutItems("", async () => [{ variant_id: 9, quantity: 1 }])).toEqual({
      items: [{ variant_id: 9, quantity: 1 }],
      source: "cart",
    });
    expect(await resolveCheckoutItems("", async () => null)).toEqual({ items: [], source: "none" });
    expect(await resolveCheckoutItems("", () => Promise.reject(new Error("x")))).toEqual({ items: [], source: "none" });
  });
});

describe("helpers", () => {
  it("itemsKey is order-independent", () => {
    expect(itemsKey([{ variant_id: 2, quantity: 1 }, { variant_id: 1, quantity: 3 }])).toBe(
      itemsKey([{ variant_id: 1, quantity: 3 }, { variant_id: 2, quantity: 1 }]),
    );
  });
  it("normalizeItems sums duplicates with the cap", () => {
    expect(normalizeItems([{ variant_id: 1, quantity: 15 }, { variant_id: 1, quantity: 10 }])).toEqual([
      { variant_id: 1, quantity: 20 },
    ]);
  });
});
