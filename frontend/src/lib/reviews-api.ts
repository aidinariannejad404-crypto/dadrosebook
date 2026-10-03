import { cache } from "react";
import { REVALIDATE_SECONDS, apiBase, fixturesEnabled, slugSegment } from "./api";
import type { BookReviews } from "./account-types";

/**
 * Public approved reviews of a book (server only, cached like other catalog reads).
 * Never throws: null when the API is unreachable/errors or in fixtures mode.
 */
export const getBookReviews = cache(async (slug: string): Promise<BookReviews | null> => {
  if (fixturesEnabled()) return null;
  try {
    const res = await fetch(`${apiBase()}/catalog/books/${slugSegment(slug)}/reviews/`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BookReviews;
    return data && data.summary && Array.isArray(data.results) ? data : null;
  } catch {
    return null;
  }
});
