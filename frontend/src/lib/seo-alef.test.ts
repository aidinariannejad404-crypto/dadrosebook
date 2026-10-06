/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD objects are read structurally in assertions */
import { describe, expect, it } from "vitest";
import books from "./__fixtures__/books.json";
import type { BookDetail } from "./types";
import type { BookReviews, Review, ShippingOption } from "./account-types";
import {
  MAX_REVIEWS_JSONLD,
  bookJsonLd,
  merchantReturnPolicyJsonLd,
  organizationJsonLd,
  reviewsJsonLd,
  shippingServiceJsonLd,
} from "./jsonld";
import { RETURN_WINDOW_DAYS } from "./content/policies";
import { buildRobots } from "./sitemap";
import { FACET_DISALLOW_PARAMS, canonicalPath, facetDisallowRules, withFacetDisallow } from "./seo";
import { trailingSlashRedirect } from "./trailing-slash";
import { isEmptyFacetState } from "./facet-crawl";
import { connectionType, isSampled, pageType, sampleRate, vitalPayload } from "./web-vitals";

const SITE = "https://dadrosebook.com";
const book = (books as unknown as BookDetail[])[0]!;

function review(i: number, rating = 5, body = `نظر ${i}`): Review {
  return {
    id: i,
    rating,
    body,
    author: `کاربر ${i}`,
    exam_type: null,
    is_verified_purchase: true,
    created_at: `2026-09-0${(i % 9) + 1}T10:00:00Z`,
  };
}

function reviewsOf(count: number, average: number | null = 4.5): BookReviews {
  return {
    summary: { average, count, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": count } },
    results: Array.from({ length: count }, (_, i) => review(i + 1)),
  };
}

describe("الف۲ Organization JSON-LD", () => {
  const ld = organizationJsonLd(SITE, null);
  it("has a raster logo ≥ 112px, alternate names and the org-level return policy", () => {
    const logo = ld.logo as { url: string; width: number };
    expect(logo.url).toMatch(/\.png$/);
    expect(logo.width).toBeGreaterThanOrEqual(112);
    expect(ld.alternateName).toContain("Dadrose Book");
    expect(ld.hasMerchantReturnPolicy).toMatchObject({ "@type": "MerchantReturnPolicy" });
  });
});

describe("الف۳ MerchantReturnPolicy", () => {
  const p = merchantReturnPolicyJsonLd(SITE);
  it("follows the real policy: finite window of RETURN_WINDOW_DAYS (7), by mail, defects free", () => {
    expect(RETURN_WINDOW_DAYS).toBe(7);
    expect(p.merchantReturnDays).toBe(7);
    expect(p.returnPolicyCategory).toBe("https://schema.org/MerchantReturnFiniteReturnWindow");
    expect(p.applicableCountry).toBe("IR");
    expect(p.returnMethod).toBe("https://schema.org/ReturnByMail");
    expect(p.customerRemorseReturnFees).toBe("https://schema.org/ReturnFeesCustomerResponsibility");
    expect(p.itemDefectReturnFees).toBe("https://schema.org/FreeReturn");
    expect(p.merchantReturnLink).toBe(`${SITE}/returns`);
  });
});

describe("الف۳ ShippingService", () => {
  const post: ShippingOption = {
    id: 1,
    code: "post",
    name: "پست پیشتاز",
    description: "",
    eta_note: "",
    price: 60_000,
    base_price: 60_000,
    is_free: false,
    free_over: 1_500_000,
    tehran_only: false,
  };
  const courier: ShippingOption = { ...post, id: 2, code: "peyk", name: "پیک", tehran_only: true };

  it("returns null without methods (no made-up rates)", () => {
    expect(shippingServiceJsonLd(SITE, [])).toBeNull();
    expect(shippingServiceJsonLd(SITE, [courier])).toBeNull();
  });
  it("emits nationwide methods with IRR rates and a free tier from free_over", () => {
    const ld = shippingServiceJsonLd(SITE, [post, courier])!;
    expect(ld["@id"]).toBe(`${SITE}/#organization`);
    const svc = ld.hasShippingService as Record<string, unknown>;
    expect(svc["@type"]).toBe("ShippingService");
    expect(svc.identifier).toBe("post");
    const conds = svc.shippingConditions as Record<string, any>[];
    expect(conds).toHaveLength(2);
    expect(conds[0]!.shippingDestination).toEqual({ "@type": "DefinedRegion", addressCountry: "IR" });
    expect(conds[0]!.shippingRate).toMatchObject({ value: 600_000, currency: "IRR" });
    expect(conds[0]!.orderValue.maxValue).toBe(15_000_000 - 1);
    expect(conds[1]!.orderValue.minValue).toBe(15_000_000);
    expect(conds[1]!.shippingRate.value).toBe(0);
  });
  it("an always-free method has a single zero-rate condition", () => {
    const ld = shippingServiceJsonLd(SITE, [{ ...post, free_over: 0 }])!;
    const conds = (ld.hasShippingService as Record<string, any>).shippingConditions;
    expect(conds).toHaveLength(1);
    expect(conds[0].shippingRate.value).toBe(0);
  });
  it("lists several services as an array", () => {
    const ld = shippingServiceJsonLd(SITE, [post, { ...post, id: 3, code: "tipax", free_over: null }])!;
    const list = ld.hasShippingService as Record<string, any>[];
    expect(list).toHaveLength(2);
    expect(list[1]!.shippingConditions).toHaveLength(1);
    expect(list[1]!.shippingConditions[0]).not.toHaveProperty("orderValue");
  });
});

describe("الف۶ Product JSON-LD", () => {
  const url = `${SITE}/product/x`;
  it("adds aggregateRating and up to 5 reviews only with ≥ 3 approved reviews", () => {
    expect(bookJsonLd(book, url, reviewsOf(2))).not.toHaveProperty("aggregateRating");
    expect(bookJsonLd(book, url, reviewsOf(2))).not.toHaveProperty("review");
    expect(bookJsonLd(book, url, reviewsOf(3, null))).not.toHaveProperty("aggregateRating");
    const ld = bookJsonLd(book, url, reviewsOf(8, 4.56));
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.6, reviewCount: 8, bestRating: 5 });
    const list = ld.review as Record<string, any>[];
    expect(list).toHaveLength(MAX_REVIEWS_JSONLD);
    expect(list[0]).toMatchObject({ "@type": "Review", reviewRating: { ratingValue: 5 }, author: { "@type": "Person" } });
    expect(list[0]!.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("reviews: rating-only entries have no body; invalid ratings dropped; empty → undefined", () => {
    const out = reviewsJsonLd([review(1, 4, "  "), review(2, 9), { ...review(3), author: "" }])!;
    expect(out).toHaveLength(2);
    expect(out[0]).not.toHaveProperty("reviewBody");
    expect(out[1]!.author).toEqual({ "@type": "Person", name: "کاربر دادرُز" });
    expect(reviewsJsonLd([])).toBeUndefined();
  });
  it("offers carry the seller linked to the Organization; ebooks are not returnable", () => {
    const ld = bookJsonLd(book, url);
    const offers = (Array.isArray(ld.offers) ? ld.offers : [ld.offers]) as Record<string, any>[];
    for (const o of offers) expect(o.seller).toMatchObject({ "@id": `${SITE}/#organization` });
    const ebook = offers.find((o) => o.name && book.variants.some((v) => v.type === "EBOOK" && v.type_label === o.name));
    if (ebook) {
      expect(ebook.hasMerchantReturnPolicy.returnPolicyCategory).toBe("https://schema.org/MerchantReturnNotPermitted");
    }
    const print = offers.find((o) => book.variants.some((v) => v.type === "PRINT" && v.type_label === o.name));
    if (print) expect(print).not.toHaveProperty("hasMerchantReturnPolicy");
    expect(ld.isbn).toBe(book.isbn);
  });
});

describe("الف۴ facet crawl control", () => {
  it("robots.txt disallows sort/price/flag params in production only", () => {
    const prod = withFacetDisallow(buildRobots(SITE, "production"));
    const rule = (Array.isArray(prod.rules) ? prod.rules[0] : prod.rules)!;
    const disallow = rule.disallow as string[];
    for (const p of FACET_DISALLOW_PARAMS) expect(disallow).toContain(`/*?*${p}=`);
    expect(disallow).toContain("/cart"); // existing rules are kept
    expect(disallow).not.toContain("/*?*subject=");
    const staging = withFacetDisallow(buildRobots(SITE, "staging"));
    expect(staging.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
  it("is idempotent", () => {
    const twice = withFacetDisallow(withFacetDisallow(buildRobots(SITE, "production")));
    const rule = (Array.isArray(twice.rules) ? twice.rules[0] : twice.rules)!;
    expect((rule.disallow as string[]).filter((d) => d === facetDisallowRules()[0])).toHaveLength(1);
  });
  it("404 only for empty filtered states or pages past the end", () => {
    const empty = { count: 0, results: [] };
    const some = { count: 3, results: [1, 2, 3] };
    expect(isEmptyFacetState({}, empty)).toBe(false); // an empty category keeps its page
    expect(isEmptyFacetState({ subject: ["madani"] }, empty)).toBe(true);
    expect(isEmptyFacetState({ in_stock: true }, some)).toBe(false);
    expect(isEmptyFacetState({ page: 5 }, { count: 3, results: [] })).toBe(true);
    expect(isEmptyFacetState({ ordering: "price" }, empty)).toBe(false); // sort alone is not a filter
  });
});

describe("الف۵ canonical + trailing slash", () => {
  it("canonicalPath keeps only page ≥ 2", () => {
    expect(canonicalPath("/category/x", { page: 1 })).toBe("/category/x");
    expect(canonicalPath("/category/x", { page: 3, utm_source: "ig", ref: "t" })).toBe("/category/x?page=3");
    expect(canonicalPath("/category/x/", { page: "2" })).toBe("/category/x?page=2");
    expect(canonicalPath("/", {})).toBe("/");
  });
  it("redirects the slash form of pages, keeping the query", () => {
    expect(trailingSlashRedirect("/product/x/")).toBe("/product/x");
    expect(trailingSlashRedirect("/category/%D8%A7/", "?page=2")).toBe("/category/%D8%A7?page=2");
    expect(trailingSlashRedirect("/kit///", "?")).toBe("/kit");
  });
  it("leaves home, clean paths and API/framework paths alone", () => {
    expect(trailingSlashRedirect("/")).toBeNull();
    expect(trailingSlashRedirect("/product/x")).toBeNull();
    expect(trailingSlashRedirect("/api/v1/catalog/books/")).toBeNull();
    expect(trailingSlashRedirect("/_next/static/x/")).toBeNull();
  });
  it("never produces a protocol-relative (off-site) Location", () => {
    expect(trailingSlashRedirect("//evil.com/")).toBe("/evil.com");
    expect(trailingSlashRedirect("//")).toBe("/");
  });
});

describe("الف۷ web vitals", () => {
  it("maps paths to low-cardinality page types", () => {
    expect(pageType("/")).toBe("home");
    expect(pageType("/product/%D8%A7")).toBe("product");
    expect(pageType("/category/x/")).toBe("category");
    expect(pageType("/returns")).toBe("policy");
    expect(pageType("/productive")).toBe("other");
  });
  it("reads the connection type defensively", () => {
    expect(connectionType({ connection: { effectiveType: "4g" } })).toBe("4g");
    expect(connectionType({ connection: { effectiveType: "3g", saveData: true } })).toBe("3g-save");
    expect(connectionType({})).toBe("unknown");
    expect(connectionType(null)).toBe("unknown");
  });
  it("samples with a configurable rate", () => {
    expect(sampleRate(undefined)).toBe(0.2);
    expect(sampleRate("1")).toBe(1);
    expect(sampleRate("7")).toBe(1);
    expect(sampleRate("x")).toBe(0.2);
    expect(isSampled(0.2, 0.1)).toBe(true);
    expect(isSampled(0.2, 0.5)).toBe(false);
    expect(isSampled(0, 0)).toBe(false);
  });
  it("builds payloads for LCP/INP/CLS/TTFB only", () => {
    expect(vitalPayload({ name: "LCP", value: 2512.4, rating: "poor", navigationType: "navigate" }, "/product/x", "4g")).toEqual({
      metric: "LCP",
      metric_value: 2512,
      rating: "poor",
      page_type: "product",
      connection: "4g",
      navigation_type: "navigate",
    });
    expect(vitalPayload({ name: "CLS", value: 0.12345 }, "/", "unknown")!.metric_value).toBe(0.123);
    expect(vitalPayload({ name: "FCP", value: 100 }, "/", "4g")).toBeNull();
    expect(vitalPayload({ name: "INP", value: Number.NaN }, "/", "4g")).toBeNull();
  });
});
