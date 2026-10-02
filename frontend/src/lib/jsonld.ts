import type { BookDetail } from "./types";

const AVAILABILITY = {
  in: "https://schema.org/InStock",
  out: "https://schema.org/OutOfStock",
};

const BOOK_FORMAT = {
  PRINT: "https://schema.org/Paperback",
  EBOOK: "https://schema.org/EBook",
  BUNDLE: "https://schema.org/Paperback",
} as const;

/**
 * schema.org Book + Product with one Offer per active variant.
 * Prices are shown in toman everywhere else; schema.org expects ISO 4217, so IRR = toman × 10 here only.
 */
export function bookJsonLd(book: BookDetail, url: string): Record<string, unknown> {
  const offers = book.variants.map((v) => ({
    "@type": "Offer",
    name: v.type_label,
    sku: String(v.id),
    price: v.effective_price * 10,
    priceCurrency: "IRR",
    availability: v.in_stock ? AVAILABILITY.in : AVAILABILITY.out,
    itemCondition: "https://schema.org/NewCondition",
    url,
  }));
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["Book", "Product"],
    "@id": `${url}#book`,
    name: book.title,
    url,
    inLanguage: "fa",
    author: book.authors.map((a) => ({ "@type": "Person", name: a.name })),
    bookFormat: book.variants[0] ? BOOK_FORMAT[book.variants[0].type] : undefined,
    numberOfPages: book.pages || undefined,
    isbn: book.isbn || undefined,
    bookEdition: book.edition || undefined,
    image: book.cover ?? undefined,
    description: stripHtml(book.description).slice(0, 500) || undefined,
    publisher: book.publisher ? { "@type": "Organization", name: book.publisher.name } : undefined,
    translator: book.translators.length ? book.translators.map((t) => ({ "@type": "Person", name: t.name })) : undefined,
    about: book.subjects.map((s) => s.name),
    brand: { "@type": "Brand", name: book.publisher?.name ?? "کتاب دادرُز" },
    offers: offers.length === 1 ? offers[0] : offers.length > 1 ? offers : undefined,
  };
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** Serialise for a <script type="application/ld+json"> without allowing "</script>" breakouts. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
