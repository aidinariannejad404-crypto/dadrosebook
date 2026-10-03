import { describe, expect, it } from "vitest";
import type { CartBook, Variant, VariantType } from "./types";
import {
  addItem,
  bulkAdd,
  emptyState,
  maxQuantity,
  removeItem,
  toCart,
  updateItem,
  type CartState,
  type Catalog,
  type CatalogEntry,
} from "./cart-rules";

const NOW = "2026-10-02T12:00:00Z";

function variant(id: number, type: VariantType, over: Partial<Variant> = {}): Variant {
  return {
    id,
    type,
    type_label: type,
    price: 1000,
    sale_price: null,
    effective_price: 1000,
    discount_percent: 0,
    in_stock: true,
    stock: type === "EBOOK" ? null : 20,
    price_is_placeholder: false,
    bundle_saving: null,
    ...over,
  };
}

const book = (id: number): CartBook => ({ id, title: `کتاب ${id}`, slug: `b-${id}`, cover: null, subjects: [], authors: [] });

const entries: CatalogEntry[] = [
  { variant: variant(1, "PRINT", { stock: 3 }), book: book(1), active: true },
  { variant: variant(2, "EBOOK"), book: book(1), active: true },
  { variant: variant(3, "BUNDLE", { price: 2000, effective_price: 1500, sale_price: 1500 }), book: book(1), active: true },
  { variant: variant(4, "PRINT", { in_stock: false, stock: 0 }), book: book(2), active: true },
  { variant: variant(5, "EBOOK", { price_is_placeholder: true }), book: book(2), active: true },
  { variant: variant(6, "PRINT"), book: book(3), active: false },
  { variant: variant(7, "PRINT", { stock: 50 }), book: book(4), active: true },
];
const byId = new Map(entries.map((e) => [e.variant.id, e]));
const catalog: Catalog = (id) => byId.get(id);

function must(r: ReturnType<typeof addItem>): CartState {
  if (!r.ok) throw new Error(`unexpected ${r.code}`);
  return r.state;
}

describe("maxQuantity", () => {
  it("is 1 for ebooks, min(stock, 10) for print, 0 when unavailable", () => {
    expect(maxQuantity(byId.get(2)!)).toBe(1);
    expect(maxQuantity(byId.get(1)!)).toBe(3);
    expect(maxQuantity(byId.get(7)!)).toBe(10);
    expect(maxQuantity(byId.get(4)!)).toBe(0);
    expect(maxQuantity(byId.get(5)!)).toBe(0);
    expect(maxQuantity(byId.get(6)!)).toBe(0);
  });
});

describe("addItem", () => {
  it("adds, increments and clamps to max_quantity without error", () => {
    let s = must(addItem(emptyState("t"), catalog, 1, 2, NOW));
    s = must(addItem(s, catalog, 1, 5, NOW));
    expect(s.items).toEqual([{ id: 1, variant_id: 1, quantity: 3 }]);
    expect(s.updated_at).toBe(NOW);
  });

  it("keeps an ebook at quantity 1", () => {
    let s = must(addItem(emptyState("t"), catalog, 2, 1, NOW));
    s = must(addItem(s, catalog, 2, 3, NOW));
    expect(s.items).toEqual([{ id: 1, variant_id: 2, quantity: 1 }]);
  });

  it("rejects out-of-stock, placeholder and inactive variants", () => {
    const s = emptyState("t");
    expect(addItem(s, catalog, 4)).toMatchObject({ ok: false, code: "out_of_stock" });
    expect(addItem(s, catalog, 5)).toMatchObject({ ok: false, code: "price_unavailable" });
    expect(addItem(s, catalog, 6)).toMatchObject({ ok: false, code: "unavailable" });
    expect(addItem(s, catalog, 999)).toMatchObject({ ok: false, code: "not_found" });
    expect(addItem(s, catalog, 1, 0)).toMatchObject({ ok: false, code: "invalid_quantity" });
  });

  it("bundle replaces the same book's ebook; ebook after bundle is already_in_bundle", () => {
    let s = must(addItem(emptyState("t"), catalog, 2, 1, NOW));
    s = must(addItem(s, catalog, 3, 1, NOW));
    expect(s.items.map((l) => l.variant_id)).toEqual([3]);
    const r = addItem(s, catalog, 2);
    expect(r).toMatchObject({ ok: false, code: "already_in_bundle" });
  });
});

describe("updateItem / removeItem", () => {
  it("sets quantity, 0 removes, above max is insufficient_stock", () => {
    let s = must(addItem(emptyState("t"), catalog, 1, 1, NOW));
    s = must(updateItem(s, catalog, 1, 2, NOW));
    expect(s.items[0]!.quantity).toBe(2);
    expect(updateItem(s, catalog, 1, 4)).toMatchObject({ ok: false, code: "insufficient_stock" });
    expect(updateItem(s, catalog, 1, -1)).toMatchObject({ ok: false, code: "invalid_quantity" });
    expect(updateItem(s, catalog, 42, 1)).toMatchObject({ ok: false, code: "not_found" });
    s = must(updateItem(s, catalog, 1, 0, NOW));
    expect(s.items).toEqual([]);
  });

  it("ebook quantity can't go above 1", () => {
    const s = must(addItem(emptyState("t"), catalog, 2, 1, NOW));
    expect(updateItem(s, catalog, 1, 2)).toMatchObject({ ok: false, code: "invalid_quantity" });
  });

  it("removes a line or reports not_found", () => {
    const s = must(addItem(emptyState("t"), catalog, 7, 1, NOW));
    expect(must(removeItem(s, 1, NOW)).items).toEqual([]);
    expect(removeItem(s, 9)).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("bulkAdd", () => {
  it("adds what it can and skips the rest", () => {
    const r = bulkAdd(emptyState("t"), catalog, [{ variant_id: 1 }, { variant_id: 4 }, { variant_id: 3 }, { variant_id: 2 }], NOW);
    expect(r.added).toEqual([1, 3]);
    expect(r.skipped.map((s) => [s.variant_id, s.code])).toEqual([
      [4, "out_of_stock"],
      [2, "already_in_bundle"],
    ]);
    expect(r.state.items.map((l) => l.variant_id)).toEqual([1, 3]);
  });
});

describe("toCart", () => {
  it("computes totals, savings and free shipping", () => {
    let s = must(addItem(emptyState("tok"), catalog, 1, 2, NOW));
    s = must(addItem(s, catalog, 3, 1, NOW));
    const cart = toCart(s, catalog, 5000);
    expect(cart.token).toBe("tok");
    expect(cart.item_count).toBe(3);
    expect(cart.subtotal).toBe(2 * 1000 + 1500);
    expect(cart.original_subtotal).toBe(2 * 1000 + 2000);
    expect(cart.savings).toBe(500);
    expect(cart.has_physical).toBe(true);
    expect(cart.free_shipping_remaining).toBe(1500);
    expect(cart.items[1]).toMatchObject({ unit_price: 1500, line_total: 1500, line_saving: 500, max_quantity: 10, issue: null });
  });

  it("flags lines whose stock dropped and leaves them out of the subtotal", () => {
    const s: CartState = { token: "t", next_id: 3, updated_at: NOW, items: [{ id: 1, variant_id: 4, quantity: 1 }, { id: 2, variant_id: 1, quantity: 5 }] };
    const cart = toCart(s, catalog, null);
    expect(cart.items.map((i) => i.issue)).toEqual(["out_of_stock", "insufficient_stock"]);
    expect(cart.has_issues).toBe(true);
    expect(cart.subtotal).toBe(0);
    expect(cart.item_count).toBe(6);
    expect(cart.free_shipping_remaining).toBeNull();
  });

  it("an ebook-only cart has no shipping", () => {
    const s = must(addItem(emptyState("t"), catalog, 2, 1, NOW));
    const cart = toCart(s, catalog, 5000);
    expect(cart.has_physical).toBe(false);
    expect(cart.free_shipping_remaining).toBeNull();
  });

  it("an empty cart without state has a null token", () => {
    expect(toCart(null, catalog, null)).toMatchObject({ token: null, items: [], item_count: 0, subtotal: 0 });
  });
});
