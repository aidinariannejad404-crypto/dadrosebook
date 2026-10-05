import type { BookCard } from "@/lib/types";

/** Cards show stars only from this many approved reviews (the API also nulls the average below it). */
export const CARD_RATING_MIN_COUNT = 5;

/** Crossed-out list price and discount badge, or null when the card price is not discounted. */
export function cardDiscount(book: BookCard): { compare: number; percent: number } | null {
  const compare = book.card_compare_price;
  const percent = book.card_discount_percent;
  if (compare == null || percent == null || percent <= 0) return null;
  if (book.card_price == null || compare <= book.card_price) return null;
  return { compare, percent };
}

/** Average + count for the card's star row, or null below CARD_RATING_MIN_COUNT reviews. */
export function cardRating(book: BookCard): { avg: number; count: number } | null {
  const count = book.rating_count ?? 0;
  const avg = book.rating_avg;
  if (avg == null || count < CARD_RATING_MIN_COUNT) return null;
  return { avg, count };
}

/** Variant id for the card's quick add; null when the card is not purchasable right now. */
export function quickAddVariant(book: BookCard): number | null {
  if (!book.in_stock || book.card_price == null) return null;
  return book.quick_add_variant_id ?? null;
}

export function inStockCount(books: BookCard[]): number {
  return books.filter((b) => b.in_stock).length;
}

/** Rails with fewer than this many in-stock books go after the others. */
export const RAIL_MIN_IN_STOCK = 2;

/**
 * Stock-aware rail order: rails with at least RAIL_MIN_IN_STOCK in-stock books keep their order
 * first; thin rails (mostly sold out) follow, in their original order. Empty rails are dropped.
 */
export function orderRailsByStock<T extends { books: BookCard[] }>(rails: T[]): T[] {
  const present = rails.filter((r) => r.books.length > 0);
  const strong = present.filter((r) => inStockCount(r.books) >= RAIL_MIN_IN_STOCK);
  const weak = present.filter((r) => inStockCount(r.books) < RAIL_MIN_IN_STOCK);
  return [...strong, ...weak];
}
