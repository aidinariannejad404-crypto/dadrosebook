import type { BookDetail, StoreSettings } from "./types";
import { toPersianDigits } from "./format";
import { COURSE_SITE, SITE_DESCRIPTION, SITE_NAME, SOCIAL_PROFILES } from "./config";
import { telegramUsername } from "./consult";

const AVAILABILITY = {
  in: "https://schema.org/InStock",
  out: "https://schema.org/OutOfStock",
};

const BOOK_FORMAT = {
  PRINT: "https://schema.org/Paperback",
  EBOOK: "https://schema.org/EBook",
  BUNDLE: "https://schema.org/Paperback",
} as const;

/** bookEdition: the edition text, else the edition badge / publish year (P1-15). */
export function bookEdition(book: Pick<BookDetail, "edition" | "edition_badge" | "publish_year">): string | undefined {
  if (book.edition.trim()) return book.edition.trim();
  if (book.edition_badge) return book.edition_badge;
  return book.publish_year ? `ویرایش ${toPersianDigits(book.publish_year)}` : undefined;
}

/**
 * schema.org Book + Product with one Offer per active variant that has a real price
 * (placeholder prices are never offered, P1-17).
 * Prices are shown in toman everywhere else; schema.org expects ISO 4217, so IRR = toman × 10 here only.
 */
export function bookJsonLd(book: BookDetail, url: string): Record<string, unknown> {
  const offers = book.variants.filter((v) => !v.price_is_placeholder).map((v) => ({
    "@type": "Offer",
    name: v.type_label,
    sku: String(v.id),
    price: v.effective_price * 10,
    priceCurrency: "IRR",
    availability: v.in_stock ? AVAILABILITY.in : AVAILABILITY.out,
    itemCondition: "https://schema.org/NewCondition",
    url,
    seller: { "@type": "Organization", name: SITE_NAME },
  }));
  const gtin = isbn13(book.isbn);
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
    sku: gtin ?? undefined,
    gtin13: gtin ?? undefined,
    bookEdition: bookEdition(book),
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

/** ISBN-13 as 13 ASCII digits (hyphens/spaces and Persian digits tolerated), else null. */
export function isbn13(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const digits = isbn
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** Organization.sameAs: configured profiles + the store's Telegram account + the academy site. */
export function sameAsLinks(store: Pick<StoreSettings, "consult_telegram"> | null | undefined): string[] {
  const tg = store ? telegramUsername(store.consult_telegram ?? "") : null;
  const links = [...SOCIAL_PROFILES, tg ? `https://t.me/${tg}` : "", COURSE_SITE].filter(Boolean);
  return [...new Set(links)];
}

/** Home page: the store as an Organization (logo + sameAs). `site` is the absolute origin. */
export function organizationJsonLd(
  site: string,
  store: Pick<StoreSettings, "consult_telegram"> | null | undefined,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: SITE_NAME,
    url: `${site}/`,
    logo: `${site}/icon.svg`,
    description: SITE_DESCRIPTION,
    sameAs: sameAsLinks(store),
  };
}

/** Home page: WebSite with a sitelinks SearchAction (/search?q=…). */
export function websiteJsonLd(site: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site}/#website`,
    name: SITE_NAME,
    url: `${site}/`,
    inLanguage: "fa",
    publisher: { "@id": `${site}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${site}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
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
