import { describe, expect, it } from "vitest";
import type { BookCard, Cart, StudyKit, Variant, VariantType } from "@/lib/types";
import { FAQ, POLICY_PAGES, RETURN_WINDOW_DAYS, faqJsonLd } from "@/lib/content/policies";
import { kitRows, pickSuggestion } from "./purchase-logic";

function v(id: number, type: VariantType, price: number, over: Partial<Variant> = {}): Variant {
  return {
    id,
    type,
    type_label: type,
    price,
    sale_price: null,
    effective_price: price,
    discount_percent: 0,
    in_stock: true,
    stock: 5,
    price_is_placeholder: false,
    bundle_saving: null,
    ...over,
  };
}

function cart(variantIds: number[]): Cart {
  return {
    token: "t",
    items: variantIds.map((id, i) => ({ id: i + 1, variant: v(id, "PRINT", 1) }) as Cart["items"][number]),
    item_count: variantIds.length,
    subtotal: 0,
    original_subtotal: 0,
    savings: 0,
    has_physical: true,
    has_issues: false,
    free_shipping_threshold: null,
    free_shipping_remaining: null,
    updated_at: null,
  };
}

const related = { id: 9, title: "کتاب مرتبط", slug: "related" } as BookCard;

describe("pickSuggestion", () => {
  const print = v(1, "PRINT", 2_200_000);
  const ebook = v(2, "EBOOK", 1_400_000);
  const bundle = v(3, "BUNDLE", 2_450_000);

  it("offers the bundle upgrade (with the extra cost) after a print-only add", () => {
    expect(pickSuggestion(print, [print, ebook, bundle], cart([1]), related)).toEqual({ kind: "upgrade", to: bundle, extra: 250_000 });
  });

  it("falls back to the ebook when there is no purchasable bundle", () => {
    const soldOut = { ...bundle, in_stock: false };
    expect(pickSuggestion(print, [print, ebook, soldOut], cart([1]), related)).toEqual({ kind: "ebook", to: ebook });
  });

  it("suggests a related book after an ebook/bundle add or when the upgrade is already in the cart", () => {
    expect(pickSuggestion(ebook, [print, ebook, bundle], cart([2]), related)).toEqual({ kind: "related", book: related });
    expect(pickSuggestion(print, [print, bundle], cart([1, 3]), related)).toEqual({ kind: "related", book: related });
    expect(pickSuggestion(bundle, [bundle], cart([3]), null)).toBeNull();
  });

  it("never offers a placeholder price", () => {
    const placeholder = { ...bundle, price_is_placeholder: true };
    expect(pickSuggestion(print, [print, placeholder], cart([1]), null)).toBeNull();
  });
});

describe("kitRows", () => {
  function kit(items: { id: number; essential: boolean; variants: Variant[] }[]): StudyKit {
    return {
      exam_type: { id: 1, name: "کانون", slug: "kanoon", short_name: "کانون" },
      subject: { id: 1, name: "مدنی", slug: "madani", color: "#000" },
      note: "",
      weight: null,
      items: items.map((it, i) => ({
        order: i,
        is_essential: it.essential,
        book: { id: it.id, title: `b${it.id}`, slug: `b${it.id}`, variants: it.variants } as StudyKit["items"][number]["book"],
      })),
    };
  }

  it("skips the current book and unbuyable books, essentials first, at most 3", () => {
    const k = kit([
      { id: 1, essential: true, variants: [v(11, "PRINT", 100)] },
      { id: 2, essential: false, variants: [v(21, "PRINT", 100)] },
      { id: 3, essential: true, variants: [v(31, "PRINT", 100, { in_stock: false })] },
      { id: 4, essential: true, variants: [v(41, "EBOOK", 100)] },
      { id: 5, essential: false, variants: [v(51, "PRINT", 100)] },
      { id: 6, essential: false, variants: [v(61, "PRINT", 100)] },
    ]);
    const rows = kitRows(k, 1);
    expect(rows.map((r) => r.book.id)).toEqual([4, 2, 5]);
    expect(rows[0]!.variant.id).toBe(41);
    expect(rows[0]!.essential).toBe(true);
  });

  it("uses the sold-out print book's ebook (default variant)", () => {
    const k = kit([{ id: 2, essential: true, variants: [v(21, "PRINT", 100, { in_stock: false }), v(22, "EBOOK", 60)] }]);
    expect(kitRows(k, 1)[0]!.variant.id).toBe(22);
  });
});

describe("policy content", () => {
  it("builds a schema.org FAQPage with every question", () => {
    const ld = faqJsonLd(FAQ) as { "@type": string; mainEntity: { "@type": string; name: string; acceptedAnswer: { text: string } }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQ.reduce((n, g) => n + g.items.length, 0));
    expect(ld.mainEntity[0]!["@type"]).toBe("Question");
    expect(ld.mainEntity[0]!.acceptedAnswer.text.length).toBeGreaterThan(10);
  });

  it("lists the four policy pages and mentions the return window", () => {
    expect(POLICY_PAGES.map((p) => p.path)).toEqual(["/about", "/shipping", "/returns", "/faq"]);
    expect(RETURN_WINDOW_DAYS).toBe(7);
  });
});
