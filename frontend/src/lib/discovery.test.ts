import { describe, expect, it } from "vitest";
import {
  activeChips,
  activeFilterCount,
  clearFilters,
  hiddenFields,
  hrefFor,
  isFiltered,
  isSelected,
  pageWindow,
  parseAmount,
  parseBookQuery,
  removeFilter,
  toggleFacet,
  toggleFlag,
  totalPages,
  withOrdering,
  withPage,
} from "./discovery";
import type { BookFacets } from "./types";
import { itemListJsonLd } from "./jsonld-discovery";

describe("parseBookQuery", () => {
  it("parses lists (comma separated and repeated), flags, prices, ordering and page", () => {
    const q = parseBookQuery({
      q: "  حقوق   مدنی ",
      subject: ["حقوق-مدنی,حقوق-تجارت", "حقوق-مدنی"],
      exam_type: "کانون-وکلا",
      format: "PRINT,ebook,foo",
      resource_type: "tests,unknown",
      min_price: "۱۰۰۰۰۰",
      max_price: "500,000",
      in_stock: "true",
      has_sample: "1",
      ordering: "price",
      page: "3",
    });
    expect(q).toEqual({
      q: "حقوق مدنی",
      subject: ["حقوق-مدنی", "حقوق-تجارت"],
      exam_type: ["کانون-وکلا"],
      format: ["print", "ebook"],
      resource_type: ["TESTS"],
      min_price: 100000,
      max_price: 500000,
      in_stock: true,
      has_sample: true,
      ordering: "price",
      page: 3,
    });
  });

  it("accepts URLSearchParams", () => {
    expect(parseBookQuery(new URLSearchParams("subject=a&subject=b&in_stock=on"))).toEqual({ subject: ["a", "b"], in_stock: true });
  });

  it("drops invalid and default values", () => {
    expect(
      parseBookQuery({ q: "  ", ordering: "-sales_count", page: "1", min_price: "abc", in_stock: "false", subject: "a b" }),
    ).toEqual({});
    expect(parseBookQuery({ ordering: "evil", page: "-2" })).toEqual({});
  });

  it("swaps a reversed price range", () => {
    expect(parseBookQuery({ min_price: "900", max_price: "100" })).toEqual({ min_price: 100, max_price: 900 });
  });
});

describe("parseAmount", () => {
  it("handles Persian digits and separators", () => {
    expect(parseAmount("۲٬۲۰۰٬۰۰۰")).toBe(2200000);
    expect(parseAmount("")).toBeUndefined();
    expect(parseAmount("12a")).toBeUndefined();
  });
});

describe("hrefs", () => {
  const base = { q: "مدنی", subject: ["حقوق-مدنی"], page: 2 } as const;

  it("builds a stable URL and omits empty params", () => {
    expect(hrefFor("/search", {})).toBe("/search");
    const href = hrefFor("/search", { ...base, subject: [...base.subject], ordering: "title" });
    const sp = new URL(href, "http://x").searchParams;
    expect([...sp.keys()]).toEqual(["q", "subject", "ordering", "page"]);
    expect(sp.get("subject")).toBe("حقوق-مدنی");
  });

  it("toggles a facet value on and off and resets the page", () => {
    const on = toggleFacet({ ...base, subject: [...base.subject] }, "subject", "حقوق-تجارت");
    expect(on).toEqual({ q: "مدنی", subject: ["حقوق-مدنی", "حقوق-تجارت"] });
    const off = toggleFacet(on, "subject", "حقوق-مدنی");
    expect(off.subject).toEqual(["حقوق-تجارت"]);
    expect(toggleFacet(off, "subject", "حقوق-تجارت")).toEqual({ q: "مدنی" });
  });

  it("normalises API facet values (PRINT → print)", () => {
    const q = toggleFacet({}, "format", "PRINT");
    expect(q.format).toEqual(["print"]);
    expect(isSelected(q, "format", "PRINT")).toBe(true);
    expect(toggleFacet(q, "format", "PRINT")).toEqual({});
  });

  it("toggles flags and removes filters, resetting the page", () => {
    expect(toggleFlag({ page: 4 }, "in_stock")).toEqual({ in_stock: true });
    expect(toggleFlag({ in_stock: true, page: 4 }, "in_stock")).toEqual({});
    expect(removeFilter({ min_price: 5, max_price: 9, page: 2 }, "max_price")).toEqual({ min_price: 5 });
    expect(removeFilter({ exam_type: ["a", "b"] }, "exam_type", "a")).toEqual({ exam_type: ["b"] });
  });

  it("clears filters but keeps q and ordering", () => {
    expect(clearFilters({ q: "x", ordering: "price", subject: ["a"], in_stock: true, page: 3 })).toEqual({ q: "x", ordering: "price" });
  });

  it("changes ordering (default removed) and page", () => {
    expect(withOrdering({ page: 3, ordering: "price" }, "-sales_count")).toEqual({});
    expect(withOrdering({}, "-price")).toEqual({ ordering: "-price" });
    expect(withPage({ q: "a" }, 2)).toEqual({ q: "a", page: 2 });
    expect(withPage({ q: "a", page: 2 }, 1)).toEqual({ q: "a" });
  });

  it("produces hidden fields for GET forms without page or the form's own fields", () => {
    expect(hiddenFields({ q: "x", subject: ["a", "b"], ordering: "price", page: 3 }, ["ordering"])).toEqual([
      ["q", "x"],
      ["subject", "a,b"],
    ]);
  });
});

describe("counts and pagination", () => {
  it("counts active filters", () => {
    expect(activeFilterCount({ q: "x", ordering: "price", page: 2 })).toBe(0);
    expect(activeFilterCount({ subject: ["a", "b"], min_price: 1, max_price: 2, in_stock: true })).toBe(4);
    expect(isFiltered({ ordering: "price", page: 2 })).toBe(false);
    expect(isFiltered({ q: "x" })).toBe(true);
    expect(isFiltered({ format: ["print"] })).toBe(true);
  });

  it("computes pages and the page window", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(49, 24)).toBe(3);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, null, 12]);
  });
});

describe("activeChips", () => {
  const facets: BookFacets = {
    count: 1,
    subjects: [{ slug: "حقوق-مدنی", name: "حقوق مدنی", color: "#123456", count: 1 }],
    exam_types: [],
    formats: [{ value: "PRINT", label: "نسخه چاپی", count: 1 }],
    resource_types: [],
    in_stock: 1,
    price: { min: null, max: null },
  };
  const fmt = (n: number) => `${n}T`;

  it("labels chips from facets and links each to the query without it", () => {
    const chips = activeChips({ subject: ["حقوق-مدنی", "اصول-فقه"], format: ["print"], max_price: 10, in_stock: true, page: 2 }, facets, fmt);
    expect(chips.map((c) => c.label)).toEqual(["حقوق مدنی", "اصول فقه", "نسخه چاپی", "تا 10T", "فقط موجود"]);
    expect(chips[0]!.color).toBe("#123456");
    expect(chips[0]!.query).toEqual({ subject: ["اصول-فقه"], format: ["print"], max_price: 10, in_stock: true });
    expect(chips[3]!.query).toEqual({ subject: ["حقوق-مدنی", "اصول-فقه"], format: ["print"], in_stock: true });
  });
});

describe("itemListJsonLd", () => {
  it("lists books with positions offset by the page", () => {
    const data = itemListJsonLd([{ title: "الف", slug: "a" }], { name: "n", url: "u", productUrl: (s) => `https://x/product/${s}`, offset: 24 });
    expect(data.itemListElement).toEqual([{ "@type": "ListItem", position: 25, url: "https://x/product/a", name: "الف" }]);
  });
});
