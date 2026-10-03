import type { BookCard } from "./types";

/** schema.org ItemList of the listed books (category pages), positions continue across pages. */
export function itemListJsonLd(
  books: Pick<BookCard, "title" | "slug">[],
  { name, url, productUrl, offset = 0 }: { name: string; url: string; productUrl: (slug: string) => string; offset?: number },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: books.length,
    itemListElement: books.map((b, i) => ({
      "@type": "ListItem",
      position: offset + i + 1,
      url: productUrl(b.slug),
      name: b.title,
    })),
  };
}
