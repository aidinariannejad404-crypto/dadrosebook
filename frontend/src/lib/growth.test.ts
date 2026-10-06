import { describe, expect, it } from "vitest";
import type { Variant } from "./types";
import {
  campaignStateAt,
  countdownTo,
  giftPayload,
  giftShareText,
  kitShareImagePath,
  kitSlugsUrl,
  shareIntents,
  sharedKitLines,
  sharedKitParams,
  sharedVariant,
  torobMeta,
  torobVariant,
  type BookWithVariants,
  type SharedKitItem,
} from "./growth";

function v(id: number, type: Variant["type"], over: Partial<Variant> = {}): Variant {
  return {
    id,
    type,
    type_label: type,
    price: 100_000,
    sale_price: null,
    effective_price: 100_000,
    discount_percent: 0,
    in_stock: true,
    stock: type === "EBOOK" ? null : 3,
    price_is_placeholder: false,
    bundle_saving: null,
    ...over,
  };
}

const book = (variants: Variant[]) => ({ id: 1, title: "آیین دادرسی مدنی", variants }) as unknown as BookWithVariants;

describe("torob meta tags (و۱)", () => {
  it("announces the print edition with old price only when discounted", () => {
    const meta = torobMeta(
      book([v(11, "EBOOK", { effective_price: 50_000 }), v(10, "PRINT", { sale_price: 90_000, effective_price: 90_000 })]),
      "toman",
    );
    expect(meta).toMatchObject({
      product_id: "10",
      product_name: "آیین دادرسی مدنی",
      product_price: "90000",
      product_old_price: "100000",
      availability: "instock",
    });
    expect(torobMeta(book([v(10, "PRINT")]), "toman").product_old_price).toBeUndefined();
  });

  it("maps availability, rial unit and skips placeholder prices", () => {
    const out = torobMeta(book([v(10, "PRINT", { in_stock: false, stock: 0 })]), "rial");
    expect(out.availability).toBe("outofstock");
    expect(out.product_price).toBe("1000000");
    expect(torobVariant([v(1, "PRINT", { price_is_placeholder: true }), v(2, "EBOOK")])?.id).toBe(2);
    expect(torobMeta(book([v(1, "PRINT", { price_is_placeholder: true })]))).toEqual({});
  });
});

describe("shared kit links (و۳)", () => {
  it("parses ?k= and ?b= and ignores junk", () => {
    expect(sharedKitParams({ k: "Ab3_xY9-" })).toEqual({ k: "Ab3_xY9-" });
    expect(sharedKitParams({ k: "<script>" })).toBeNull();
    expect(sharedKitParams({ b: "الف, ب ,," })).toEqual({ b: ["الف", "ب"] });
    expect(sharedKitParams({ exam: "vekalat" })).toBeNull();
  });

  it("builds fallback, OG and share URLs", () => {
    expect(kitSlugsUrl("vekalat", ["a", "b"])).toBe("/kit?exam=vekalat&b=a%2Cb");
    expect(kitShareImagePath({ k: "abcd1234" })).toBe("/kit/share-image?k=abcd1234");
    expect(kitShareImagePath({ b: ["a"] }, "vekalat")).toBe("/kit/share-image?b=a&exam=vekalat");
    const s = shareIntents("https://x.ir/kit?k=1", "کیت من");
    expect(s.telegram).toBe(`https://t.me/share/url?url=${encodeURIComponent("https://x.ir/kit?k=1")}&text=${encodeURIComponent("کیت من")}`);
    expect(decodeURIComponent(s.whatsapp)).toBe("https://wa.me/?text=کیت من\nhttps://x.ir/kit?k=1");
  });

  it("keeps the sharer's format when still buyable, else falls back", () => {
    const item = (variant_id: number | null, variants: Variant[]): SharedKitItem => ({ variant_id, book: book(variants) });
    expect(sharedVariant(item(2, [v(1, "PRINT"), v(2, "EBOOK")]))?.id).toBe(2);
    expect(sharedVariant(item(1, [v(1, "PRINT", { in_stock: false }), v(2, "EBOOK"), v(3, "BUNDLE")]))?.id).toBe(3);
    expect(sharedVariant(item(null, [v(1, "PRINT"), v(2, "EBOOK")]))?.id).toBe(1);
    expect(sharedVariant(item(null, [v(1, "PRINT", { price_is_placeholder: true })]))).toBeNull();
    const lines = sharedKitLines([item(null, [v(1, "PRINT")]), item(null, [v(5, "PRINT", { in_stock: false })])]);
    expect(lines.map((l) => l.variant.id)).toEqual([1]);
  });
});

describe("gifts (و۴)", () => {
  it("trims the payload and writes the share text", () => {
    expect(giftPayload({ sender_name: "  مریم  ", recipient_name: " علی\n", message: "x".repeat(400) })).toEqual({
      sender_name: "مریم",
      recipient_name: "علی",
      message: "x".repeat(300),
    });
    expect(giftShareText({ sender_name: "مریم", recipient_name: "" })).toMatch(/^مریم برایت کتاب هدیه/);
    expect(giftShareText({ sender_name: "مریم", recipient_name: "علی" })).toMatch(/^علی عزیز، مریم/);
  });
});

describe("campaigns (و۶)", () => {
  const c = { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-10T00:00:00Z" };
  it("derives the state from the window", () => {
    expect(campaignStateAt(c, Date.parse("2026-09-30T23:59:59Z"))).toBe("upcoming");
    expect(campaignStateAt(c, Date.parse("2026-10-05T00:00:00Z"))).toBe("active");
    expect(campaignStateAt(c, Date.parse("2026-10-10T00:00:01Z"))).toBe("ended");
  });
  it("counts down and stops at zero", () => {
    const now = Date.parse("2026-10-08T21:30:15Z");
    expect(countdownTo(c.ends_at, now)).toEqual({ days: 1, hours: 2, minutes: 29, seconds: 45, done: false });
    expect(countdownTo(c.ends_at, Date.parse("2026-10-11T00:00:00Z")).done).toBe(true);
  });
});
