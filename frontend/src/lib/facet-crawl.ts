import type { BookQuery } from "./types";
import { isFiltered } from "./discovery";

/**
 * Package الف۴ (Google faceted-navigation guide, 12/2024): a filter combination with no books, or a page
 * number past the last page, answers 404 instead of a thin 200. The unfiltered first page of a category
 * is never a 404, even when the category is empty (it is a real, linked page).
 */
export function isEmptyFacetState(query: BookQuery, result: { count: number; results: readonly unknown[] }): boolean {
  const page = query.page ?? 1;
  if (!isFiltered(query) && page <= 1) return false;
  return result.count === 0 || result.results.length === 0;
}
