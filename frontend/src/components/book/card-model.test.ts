import { describe, expect, it } from "vitest";
import type { BookCard } from "@/lib/types";
import home from "@/lib/__fixtures__/home.json";
import related from "@/lib/__fixtures__/related.json";
import { cardDiscount, cardRating, orderRailsByStock, quickAddVariant } from "./card-model";
import { RECENTLY_VIEWED_MAX, parseViewed, pushViewed, type ViewedBook } from "./recently-viewed";

const base = home.bestsellers[0] as unknown as BookCard;
const card = (over: Partial<BookCard>): BookCard => ({ ...base, ...over });

describe("cardDiscount", () => {
  it("shows the crossed-out price only for a real discount", () => {
    expect(cardDiscount(card({ card_price: 850_000, card_compare_price: 1_000_000, card_discount_percent: 15 }))).toEqual({
      compare: 1_000_000,
      percent: 15,
    });
    expect(cardDiscount(card({ card_compare_price: null, card_discount_percent: null }))).toBeNull();
    expect(cardDiscount(card({ card_price: 1_000_000, card_compare_price: 1_000_000, card_discount_percent: 5 }))).toBeNull();
    expect(cardDiscount(card({ card_price: null, card_compare_price: 1_000_000, card_discount_percent: 10 }))).toBeNull();
    expect(cardDiscount(card({ card_compare_price: undefined, card_discount_percent: undefined }))).toBeNull();
  });
});

describe("cardRating", () => {
  it("needs five approved reviews", () => {
    expect(cardRating(card({ rating_avg: 4.6, rating_count: 5 }))).toEqual({ avg: 4.6, count: 5 });
    expect(cardRating(card({ rating_avg: 5, rating_count: 4 }))).toBeNull();
    expect(cardRating(card({ rating_avg: null, rating_count: 9 }))).toBeNull();
    expect(cardRating(card({ rating_avg: undefined, rating_count: undefined }))).toBeNull();
  });
});

describe("quickAddVariant", () => {
  it("only for in-stock cards with a price and a variant", () => {
    expect(quickAddVariant(card({ in_stock: true, card_price: 10, quick_add_variant_id: 7 }))).toBe(7);
    expect(quickAddVariant(card({ in_stock: false, card_price: 10, quick_add_variant_id: 7 }))).toBeNull();
    expect(quickAddVariant(card({ in_stock: true, card_price: null, quick_add_variant_id: 7 }))).toBeNull();
    expect(quickAddVariant(card({ in_stock: true, card_price: 10, quick_add_variant_id: null }))).toBeNull();
  });
});

describe("orderRailsByStock", () => {
  const books = (stock: boolean[]) => stock.map((s, i) => card({ id: i + 1, in_stock: s }));
  it("moves rails with < 2 in-stock books after the others, keeping order", () => {
    const rails = [
      { key: "a", books: books([true, false, false]) },
      { key: "b", books: books([true, true]) },
      { key: "c", books: [] },
      { key: "d", books: books([false, true, true]) },
      { key: "e", books: books([false]) },
    ];
    expect(orderRailsByStock(rails).map((r) => r.key)).toEqual(["b", "d", "a", "e"]);
  });
});

describe("fixtures follow the API rules", () => {
  const cards = [
    ...home.bestsellers,
    ...home.quick_review,
    ...(home.discounted ?? []),
    ...Object.values(related).flat(),
  ] as unknown as BookCard[];
  it("related books are in stock and quick review lists in-stock books first", () => {
    expect(Object.values(related).flat().every((b) => b.in_stock)).toBe(true);
    const stock = home.quick_review.map((b) => b.in_stock);
    expect(stock).toEqual([...stock].sort((a, b) => Number(b) - Number(a)));
  });
  it("discounted cards carry a consistent compare price", () => {
    expect((home.discounted ?? []).length).toBeGreaterThan(0);
    for (const b of cards) {
      const d = cardDiscount(b);
      if (b.card_discount_percent != null) {
        expect(d).not.toBeNull();
        expect(Math.round(((d!.compare - b.card_price!) * 100) / d!.compare)).toBe(d!.percent);
      }
    }
  });
});

describe("recently viewed", () => {
  const viewed = (id: number): ViewedBook => ({
    id,
    slug: `b-${id}`,
    title: `کتاب ${id}`,
    cover: null,
    subjects: [{ id: 1, name: "مدنی", slug: "m", color: "#123456" }],
    authors: [],
    volumes: 1,
  });

  it("keeps the latest first, unique, capped", () => {
    let list: ViewedBook[] = [];
    for (let i = 1; i <= RECENTLY_VIEWED_MAX + 3; i++) list = pushViewed(list, viewed(i));
    list = pushViewed(list, viewed(5));
    expect(list).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(list[0]!.id).toBe(5);
    expect(list.filter((b) => b.id === 5)).toHaveLength(1);
  });

  it("parses defensively", () => {
    expect(parseViewed(null)).toEqual([]);
    expect(parseViewed("not json")).toEqual([]);
    expect(parseViewed('{"a":1}')).toEqual([]);
    expect(parseViewed(JSON.stringify([viewed(1), { id: "x" }, null]))).toEqual([viewed(1)]);
  });
});
