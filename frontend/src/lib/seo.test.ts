import { describe, expect, it } from "vitest";
import books from "./__fixtures__/books.json";
import type { BookDetail } from "./types";
import { bookJsonLd, isbn13, organizationJsonLd, sameAsLinks, websiteJsonLd } from "./jsonld";
import { COURSE_SITE } from "./config";
import { NOINDEX_FOLLOW, isNoindexPath, searchRobots } from "./seo";

const SITE = "https://dadrosebook.com";

describe("isbn13", () => {
  it("accepts hyphenated, spaced and Persian-digit ISBN-13s", () => {
    expect(isbn13("978-622-7710-12-4")).toBe("9786227710124");
    expect(isbn13("978 622 7710 12 4")).toBe("9786227710124");
    expect(isbn13("۹۷۸-۶۲۲-۷۷۱۰-۱۲-۴")).toBe("9786227710124");
  });
  it("rejects ISBN-10 and empty values", () => {
    expect(isbn13("964-123-456-7")).toBeNull();
    expect(isbn13("")).toBeNull();
    expect(isbn13(null)).toBeNull();
  });
});

describe("bookJsonLd offers", () => {
  const book = (books as unknown as BookDetail[])[0]!;
  const ld = bookJsonLd(book, `${SITE}/product/x`);
  it("every Offer has price, currency, availability and seller", () => {
    const raw = ld.offers;
    const offers = (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(typeof o.price).toBe("number");
      expect(o.priceCurrency).toBe("IRR");
      expect(String(o.availability)).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
      expect(o.seller).toMatchObject({ "@type": "Organization" });
    }
  });
  it("adds sku/gtin13 from a 13-digit ISBN only", () => {
    expect(ld.gtin13).toBe(isbn13(book.isbn));
    expect(ld.sku).toBe(ld.gtin13);
    const noIsbn = bookJsonLd({ ...book, isbn: "" }, `${SITE}/product/x`);
    expect(noIsbn).not.toHaveProperty("gtin13");
    expect(noIsbn).not.toHaveProperty("sku");
  });
});

describe("home JSON-LD", () => {
  it("Organization has logo and sameAs (telegram from store + academy site)", () => {
    const ld = organizationJsonLd(SITE, { consult_telegram: "@dadrose_support" });
    expect(ld["@type"]).toBe("OnlineStore");
    expect(ld.logo).toMatchObject({ "@type": "ImageObject", url: `${SITE}/logo.png`, width: 512, height: 512 });
    expect(ld.sameAs).toContain("https://t.me/dadrose_support");
    expect(ld.sameAs).toContain(COURSE_SITE);
  });
  it("sameAs skips invalid telegram values and dedupes", () => {
    expect(sameAsLinks({ consult_telegram: "" })).toEqual([...new Set([COURSE_SITE])]);
    expect(sameAsLinks(null)).toContain(COURSE_SITE);
  });
  it("WebSite has alternate names and no SearchAction (sitelinks search box is gone)", () => {
    const ld = websiteJsonLd(SITE);
    expect(ld.alternateName).toEqual(["دادرز بوک", "Dadrose Book"]);
    expect(ld).not.toHaveProperty("potentialAction");
  });
});

describe("robots helpers", () => {
  it("marks personal routes noindex", () => {
    for (const p of ["/cart", "/checkout/pay", "/account", "/account/orders", "/login", "/read/1", "/plan/abc"]) {
      expect(isNoindexPath(p)).toBe(true);
    }
    for (const p of ["/", "/product/x", "/category/y", "/kit", "/planner", "/cartoon"]) {
      expect(isNoindexPath(p)).toBe(false);
    }
  });
  it("never indexes /search, with or without q", () => {
    expect(searchRobots()).toBe(NOINDEX_FOLLOW);
    expect(NOINDEX_FOLLOW).toMatchObject({ index: false, follow: true });
  });
});
