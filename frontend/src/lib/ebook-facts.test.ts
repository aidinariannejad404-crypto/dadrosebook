import { describe, expect, it } from "vitest";
import { ebookFacts, ebookSavingPercent } from "./ebook-facts";
import type { Variant } from "./types";

const v = (type: Variant["type"], effective_price: number, extra: Partial<Variant> = {}): Variant =>
  ({
    id: effective_price,
    type,
    type_label: type,
    price: effective_price,
    sale_price: null,
    effective_price,
    discount_percent: 0,
    in_stock: true,
    stock: null,
    price_is_placeholder: false,
    bundle_saving: null,
    ...extra,
  }) as Variant;

describe("ebook facts", () => {
  it("computes the saving against print, floored", () => {
    expect(ebookSavingPercent(v("PRINT", 2_200_000), v("EBOOK", 990_000))).toBe(55);
    expect(ebookSavingPercent(v("PRINT", 100_000), v("EBOOK", 65_000))).toBe(35);
    expect(ebookSavingPercent(v("PRINT", 100_000), v("EBOOK", 99_500))).toBeNull();
    expect(ebookSavingPercent(v("PRINT", 100_000), v("EBOOK", 120_000))).toBeNull();
    expect(ebookSavingPercent(undefined, v("EBOOK", 1))).toBeNull();
    expect(ebookSavingPercent(v("PRINT", 100_000, { price_is_placeholder: true }), v("EBOOK", 50_000))).toBeNull();
  });

  it("lists saving, format, pages and mobile-friendly for EPUB", () => {
    const facts = ebookFacts({ saving: 35, formats: ["EPUB", "PDF"], pages: 1250 });
    expect(facts.map((f) => f.key)).toEqual(["saving", "format", "pages", "mobile"]);
    expect(facts[0]!.text).toBe("۳۵٪ ارزان‌تر از نسخه چاپی");
    expect(facts[1]!.text).toBe("فایل EPUB و PDF");
    expect(facts[2]!.text).toBe("۱٬۲۵۰ صفحه");
  });

  it("PDF only is not «مناسب موبایل»; unknown values are skipped", () => {
    expect(ebookFacts({ saving: null, formats: ["PDF", "DOCX"], pages: 0 }).map((f) => f.key)).toEqual(["format"]);
    expect(ebookFacts({ saving: null })).toEqual([]);
  });
});
