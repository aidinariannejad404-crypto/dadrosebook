import { describe, expect, it } from "vitest";
import { examCountdown } from "./countdown";
import { cardPriceLabel, defaultVariant } from "./variants";
import { videoEmbed } from "./video";
import { bookJsonLd, serializeJsonLd } from "./jsonld";
import { decodeSlug, slugSegment } from "./api";
import { withCourseUtm } from "./config";
import type { BookCard, BookDetail, HomePayload, Variant } from "./types";
import books from "./__fixtures__/books.json";
import home from "./__fixtures__/home.json";
import related from "./__fixtures__/related.json";

const v = (type: Variant["type"], in_stock: boolean, id = 1): Variant => ({
  id,
  type,
  type_label: type,
  price: 100,
  sale_price: null,
  effective_price: 100,
  discount_percent: 0,
  in_stock,
  stock: type === "EBOOK" ? null : in_stock ? 3 : 0,
  price_is_placeholder: false,
  bundle_saving: null,
});

describe("defaultVariant", () => {
  it("prefers PRINT when in stock", () => {
    expect(defaultVariant([v("PRINT", true, 1), v("EBOOK", true, 2), v("BUNDLE", true, 3)])?.id).toBe(1);
  });
  it("falls back to EBOOK when print is out", () => {
    expect(defaultVariant([v("PRINT", false, 1), v("EBOOK", true, 2), v("BUNDLE", false, 3)])?.id).toBe(2);
  });
  it("falls back to the first variant", () => {
    expect(defaultVariant([v("PRINT", false, 1)])?.id).toBe(1);
    expect(defaultVariant([])).toBeUndefined();
  });
});

describe("examCountdown", () => {
  it("counts down to 00:00 Tehran time", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    // target 2026-11-04T20:30:00Z → 33 days 8.5 hours
    expect(examCountdown("2026-11-05", now)).toEqual({ days: 33, hours: 8, past: false });
  });
  it("reports past exams", () => {
    expect(examCountdown("2020-01-01", Date.now()).past).toBe(true);
  });
});

describe("videoEmbed", () => {
  it("handles aparat, youtube and files", () => {
    expect(videoEmbed("https://www.aparat.com/v/abc12")).toEqual({
      kind: "iframe",
      src: "https://www.aparat.com/video/video/embed/videohash/abc12/vt/frame?autoplay=true",
    });
    expect(videoEmbed("https://youtu.be/xyz").src).toContain("youtube-nocookie.com/embed/xyz");
    expect(videoEmbed("https://cdn.example.com/intro.mp4").kind).toBe("file");
    expect(videoEmbed("https://example.com/page").kind).toBe("link");
  });
});

describe("slugs", () => {
  it("encodes Persian slugs for API paths and decodes route params", () => {
    const slug = "حقوق-مدنی-دوجلدی-دکتر-شکری";
    const enc = slugSegment(slug);
    expect(enc).not.toMatch(/[؀-ۿ]/);
    expect(decodeSlug(enc)).toBe(slug);
    expect(decodeSlug(slug)).toBe(slug);
    expect(decodeSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("withCourseUtm", () => {
  it("adds UTM params", () => {
    const u = new URL(withCourseUtm("https://dadrose.com/courses/x?ref=1", "product_course"));
    expect(u.searchParams.get("utm_source")).toBe("dadrosebook");
    expect(u.searchParams.get("utm_medium")).toBe("referral");
    expect(u.searchParams.get("utm_campaign")).toBe("product_course");
    expect(u.searchParams.get("ref")).toBe("1");
  });
});

describe("bookJsonLd", () => {
  const book = (books as unknown as BookDetail[])[0]!;
  it("emits Book+Product with IRR offers", () => {
    const ld = bookJsonLd(book, "https://example.com/product/x");
    expect(ld["@type"]).toEqual(["Book", "Product"]);
    const offers = ld.offers as { price: number; priceCurrency: string; availability: string }[];
    expect(offers).toHaveLength(book.variants.length);
    expect(offers[0]!.price).toBe(book.variants[0]!.effective_price * 10);
    expect(offers[0]!.priceCurrency).toBe("IRR");
  });
  it("escapes < in serialised JSON-LD", () => {
    expect(serializeJsonLd({ a: "</script>" })).not.toContain("</script>");
  });
});

describe("card price", () => {
  it("labels only non-print card prices", () => {
    expect(cardPriceLabel("PRINT")).toBeNull();
    expect(cardPriceLabel(null)).toBeNull();
    expect(cardPriceLabel("EBOOK")).toBe("نسخه الکترونیک");
    expect(cardPriceLabel("BUNDLE")).toContain("الکترونیک");
  });

  const details = books as unknown as BookDetail[];
  it("fixtures: card_price is the PRINT price when print exists, else the cheapest (non-placeholder only)", () => {
    for (const b of details) {
      const real = b.variants.filter((x) => !x.price_is_placeholder);
      const print = real.find((x) => x.type === "PRINT");
      const cheapest = [...real].sort((a, c) => a.effective_price - c.effective_price)[0];
      const expected = print ?? cheapest;
      expect(b.card_format, b.slug).toBe(expected?.type ?? null);
      expect(b.card_price, b.slug).toBe(expected?.effective_price ?? null);
    }
  });

  it("fixtures: every BookCard copy agrees with its detail", () => {
    const h = home as unknown as HomePayload;
    const cards: BookCard[] = [
      ...h.bestsellers,
      ...h.quick_review,
      ...Object.values(related as unknown as Record<string, BookCard[]>).flat(),
    ];
    const byId = new Map(details.map((b) => [b.id, b]));
    for (const c of cards) {
      const d = byId.get(c.id)!;
      expect([c.card_price, c.card_format, c.cover, c.badges, c.resource_type]).toEqual([
        d.card_price,
        d.card_format,
        d.cover,
        d.badges,
        d.resource_type,
      ]);
    }
  });
});
