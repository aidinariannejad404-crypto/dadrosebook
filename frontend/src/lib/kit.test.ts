import { describe, expect, it } from "vitest";
import type { StudyKit, Variant, VariantType } from "./types";
import { defaultFormat, formatOptions, initialSelection, kitTotals, kitUrl, orderKits, parseSubjects, selectedLines } from "./kit";

function v(id: number, type: VariantType, over: Partial<Variant> = {}): Variant {
  return {
    id,
    type,
    type_label: type,
    price: 1000,
    sale_price: null,
    effective_price: 1000,
    discount_percent: 0,
    in_stock: true,
    stock: 5,
    price_is_placeholder: false,
    bundle_saving: null,
    ...over,
  };
}

function kit(subject: string, weight: number | null, items: { id: number; essential: boolean; variants: Variant[] }[]): StudyKit {
  return {
    exam_type: { id: 1, name: "کانون", slug: "kanoon", short_name: "کانون" },
    subject: { id: subject.length, name: subject, slug: subject, color: "#000" },
    note: "",
    weight,
    items: items.map((it, i) => ({
      order: i,
      is_essential: it.essential,
      book: { id: it.id, title: `b${it.id}`, variants: it.variants } as StudyKit["items"][number]["book"],
    })),
  };
}

describe("defaultFormat", () => {
  it("prefers a purchasable bundle, then in-stock print, then ebook", () => {
    expect(defaultFormat([v(1, "PRINT"), v(2, "EBOOK"), v(3, "BUNDLE")])?.id).toBe(3);
    expect(defaultFormat([v(1, "PRINT"), v(2, "EBOOK"), v(3, "BUNDLE", { price_is_placeholder: true })])?.id).toBe(1);
    expect(defaultFormat([v(1, "PRINT", { in_stock: false }), v(2, "EBOOK"), v(3, "BUNDLE", { in_stock: false })])?.id).toBe(2);
    expect(defaultFormat([v(1, "PRINT", { in_stock: false }), v(2, "EBOOK", { price_is_placeholder: true })])).toBeUndefined();
  });
});

describe("formatOptions", () => {
  it("drops placeholder prices and orders PRINT, EBOOK, BUNDLE", () => {
    const opts = formatOptions([v(3, "BUNDLE"), v(2, "EBOOK", { price_is_placeholder: true }), v(1, "PRINT", { in_stock: false })]);
    expect(opts.map((o) => o.id)).toEqual([1, 3]);
  });
});

describe("orderKits / parseSubjects", () => {
  const kits = [kit("a", null, []), kit("b", 2, []), kit("c", 3, []), kit("d", 2, [])];
  it("orders by weight desc, unweighted last, stable", () => {
    expect(orderKits(kits).map((k) => k.subject.slug)).toEqual(["c", "b", "d", "a"]);
  });
  it("parses the s param against the kit", () => {
    expect(parseSubjects(null, kits)).toEqual(["a", "b", "c", "d"]);
    expect(parseSubjects("c,x,a", kits)).toEqual(["a", "c"]);
    expect(parseSubjects("x", kits)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("selection and totals", () => {
  const kits = [
    kit("a", 2, [
      { id: 1, essential: true, variants: [v(11, "PRINT", { price: 1200, effective_price: 1000 }), v(12, "BUNDLE", { price: 2000, effective_price: 1800 })] },
      { id: 2, essential: false, variants: [v(21, "PRINT")] },
      { id: 3, essential: true, variants: [v(31, "PRINT", { in_stock: false })] },
    ]),
    kit("b", 1, [{ id: 1, essential: false, variants: [v(11, "PRINT"), v(12, "BUNDLE")] }, { id: 4, essential: true, variants: [v(41, "EBOOK", { price: 500, effective_price: 500 })] }]),
  ];

  it("preselects essential books that can be bought, with the default format", () => {
    const sel = initialSelection(kits);
    expect(sel.books).toEqual({ 1: true, 2: false, 3: false, 4: true });
    expect(sel.formats).toEqual({ 1: 12, 2: 21, 3: undefined, 4: 41 });
  });

  it("counts a book once across subjects and only for selected subjects", () => {
    const sel = initialSelection(kits);
    const lines = selectedLines(kits, ["a", "b"], sel);
    expect(lines.map((l) => l.variant.id)).toEqual([12, 41]);
    expect(kitTotals(lines)).toEqual({ books: 2, total: 2300, original: 2500, savings: 200 });
    expect(selectedLines(kits, ["b"], sel).map((l) => l.variant.id)).toEqual([12, 41]);
    expect(kitTotals([])).toEqual({ books: 0, total: 0, original: 0, savings: 0 });
  });
});

describe("kitUrl", () => {
  it("omits s when every subject is selected", () => {
    expect(kitUrl("kanoon", ["a", "b"], ["a", "b"])).toBe("/kit?exam=kanoon");
    expect(kitUrl("کانون-وکلا", ["a"], ["a", "b"])).toBe(`/kit?exam=${encodeURIComponent("کانون-وکلا")}&s=a`);
  });
});
