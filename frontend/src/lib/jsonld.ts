import type { BookDetail, StoreSettings } from "./types";
import type { BookReviews, Review, ShippingOption } from "./account-types";
import { aggregateRating, authorName } from "./reviews";
import { RETURNS, RETURN_WINDOW_DAYS } from "./content/policies";
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
export function bookJsonLd(
  book: BookDetail,
  url: string,
  reviews?: Pick<BookReviews, "summary" | "results"> | null,
): Record<string, unknown> {
  const site = origin(url);
  const seller = { "@type": "Organization", ...(site ? { "@id": `${site}/#organization` } : {}), name: SITE_NAME };
  const offers = book.variants.filter((v) => !v.price_is_placeholder).map((v) => ({
    "@type": "Offer",
    name: v.type_label,
    sku: String(v.id),
    price: v.effective_price * 10,
    priceCurrency: "IRR",
    availability: v.in_stock ? AVAILABILITY.in : AVAILABILITY.out,
    itemCondition: "https://schema.org/NewCondition",
    url,
    seller,
    // print/bundle offers inherit the Organization-level return policy; ebooks are not returnable
    ...(v.type === "EBOOK" ? { hasMerchantReturnPolicy: EBOOK_RETURN_POLICY } : {}),
  }));
  const rating = aggregateRating(reviews?.summary);
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
    // stars only with the same rule as the page (≥ 3 approved reviews and an average)
    aggregateRating: rating ?? undefined,
    review: rating ? reviewsJsonLd(reviews?.results ?? []) : undefined,
  };
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

/** Max individual Review objects on a Product (Google shows a snippet from one; more is noise). */
export const MAX_REVIEWS_JSONLD = 5;

/** Up to 5 approved, visible reviews as schema.org Review (newest first, as the API returns them). */
export function reviewsJsonLd(results: readonly Review[]): Record<string, unknown>[] | undefined {
  const out = results
    .filter((r) => Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5)
    .slice(0, MAX_REVIEWS_JSONLD)
    .map((r) => {
      const body = r.body.trim();
      return {
        "@type": "Review",
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { "@type": "Person", name: authorName(r.author) },
        ...(r.created_at ? { datePublished: r.created_at.slice(0, 10) } : {}),
        ...(body ? { reviewBody: body.slice(0, 1000) } : {}),
      };
    });
  return out.length ? out : undefined;
}

function origin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
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

/** Other names people use for the store (Google "site names": WebSite.alternateName). */
export const SITE_ALTERNATE_NAMES = ["دادرز بوک", "Dadrose Book"] as const;

/** Raster logo for Organization.logo (Google needs a crawlable PNG/JPG ≥ 112px, not SVG): app/logo.png/route.tsx. */
export const LOGO_PATH = "/logo.png";
export const LOGO_SIZE = 512;

/**
 * Org-level return policy (MerchantReturnPolicy nested in Organization, supported by Google since 06/2024).
 * Mirrors lib/content/policies.ts RETURNS and backend apps/orders/services/returns.py: print books may be
 * returned within RETURN_WINDOW_DAYS of delivery, by mail; on change of mind the buyer pays return shipping,
 * defective/wrong items are free. Ebooks override this with MerchantReturnNotPermitted on their Offer.
 */
export function merchantReturnPolicyJsonLd(site: string): Record<string, unknown> {
  return {
    "@type": "MerchantReturnPolicy",
    "@id": `${site}/#return-policy`,
    applicableCountry: "IR",
    returnPolicyCountry: "IR",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    customerRemorseReturnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    itemDefectReturnFees: "https://schema.org/FreeReturn",
    refundType: "https://schema.org/FullRefund",
    merchantReturnLink: `${site}${RETURNS.path}`,
  };
}

/** Product-level override for ebook offers: activated ebooks cannot be returned (policies.ts RETURNS). */
export const EBOOK_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "IR",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
} as const;

/** Home page: the store as an Organization (raster logo, sameAs, return policy). `site` is the absolute origin. */
export function organizationJsonLd(
  site: string,
  store: Pick<StoreSettings, "consult_telegram"> | null | undefined,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore", // the most specific Organization subtype (Google merchant docs)
    "@id": `${site}/#organization`,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: `${site}/`,
    logo: {
      "@type": "ImageObject",
      url: `${site}${LOGO_PATH}`,
      contentUrl: `${site}${LOGO_PATH}`,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    },
    description: SITE_DESCRIPTION,
    sameAs: sameAsLinks(store),
    hasMerchantReturnPolicy: merchantReturnPolicyJsonLd(site),
  };
}

/** Home page: WebSite with the site name and its alternate names (no SearchAction: Google dropped it 11/2024). */
export function websiteJsonLd(site: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site}/#website`,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: `${site}/`,
    inLanguage: "fa",
    publisher: { "@id": `${site}/#organization` },
  };
}

/** Days the store needs to pack and hand over an order (policies.ts SHIPPING: «یک تا دو روز کاری»). */
export const HANDLING_DAYS = { min: 1, max: 2 } as const;

function irr(toman: number): Record<string, unknown> {
  return { "@type": "MonetaryAmount", value: toman * 10, currency: "IRR" };
}

/**
 * /shipping page: Organization → hasShippingService (Google, 11/2025), one ShippingService per nationwide
 * shipping method from the API (Tehran-only couriers are left out: no ISO region needed). Below
 * `free_over` the method's base price applies, from it shipping is free. Prices are IRR (toman × 10).
 * Returns null without methods (API down) so no made-up rates are published.
 */
export function shippingServiceJsonLd(site: string, methods: readonly ShippingOption[]): Record<string, unknown> | null {
  const nationwide = methods.filter((m) => !m.tehran_only && Number.isInteger(m.base_price) && m.base_price >= 0);
  if (!nationwide.length) return null;
  const destination = { "@type": "DefinedRegion", addressCountry: "IR" };
  const services = nationwide.map((m) => {
    const conditions: Record<string, unknown>[] = [];
    if (m.free_over === 0 || m.base_price === 0) {
      conditions.push({ "@type": "ShippingConditions", shippingDestination: destination, shippingRate: irr(0) });
    } else {
      conditions.push({
        "@type": "ShippingConditions",
        shippingDestination: destination,
        ...(m.free_over != null
          ? { orderValue: { "@type": "MonetaryAmount", minValue: 0, maxValue: m.free_over * 10 - 1, currency: "IRR" } }
          : {}),
        shippingRate: irr(m.base_price),
      });
      if (m.free_over != null) {
        conditions.push({
          "@type": "ShippingConditions",
          shippingDestination: destination,
          orderValue: { "@type": "MonetaryAmount", minValue: m.free_over * 10, currency: "IRR" },
          shippingRate: irr(0),
        });
      }
    }
    return {
      "@type": "ShippingService",
      identifier: m.code,
      name: m.name,
      ...(m.description ? { description: m.description } : {}),
      fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
      handlingTime: {
        "@type": "ServicePeriod",
        duration: { "@type": "QuantitativeValue", minValue: HANDLING_DAYS.min, maxValue: HANDLING_DAYS.max, unitCode: "DAY" },
      },
      shippingConditions: conditions,
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore", // the most specific Organization subtype (Google merchant docs)
    "@id": `${site}/#organization`,
    name: SITE_NAME,
    url: `${site}/`,
    hasShippingService: services.length === 1 ? services[0] : services,
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
