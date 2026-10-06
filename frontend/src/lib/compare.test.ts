import { describe, expect, it } from "vitest";
import { cheapestIndex, compareHref, parseCompareItems, parseCompareParam, toggleCompare } from "./compare";

describe("compare", () => {
  it("parses the b= param: comma list, encoded Persian slugs, dedupe, max 3", () => {
    expect(parseCompareParam("a,b")).toEqual(["a", "b"]);
    expect(parseCompareParam(encodeURIComponent("حقوق-مدنی") + ",x")).toEqual(["حقوق-مدنی", "x"]);
    expect(parseCompareParam(["a,b", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(parseCompareParam(" a , ,../etc,<script>,a ")).toEqual(["a"]);
    expect(parseCompareParam(undefined)).toEqual([]);
    expect(parseCompareParam("%E0%A4%A")).toEqual([]);
  });

  it("builds hrefs", () => {
    expect(compareHref(["حقوق-مدنی", "b"])).toBe(`/compare?b=${encodeURIComponent("حقوق-مدنی")},b`);
    expect(compareHref([])).toBe("/compare");
    expect(parseCompareParam(compareHref(["x-1", "y_2"]).split("b=")[1])).toEqual(["x-1", "y_2"]);
  });

  it("toggles the tray and refuses a 4th book", () => {
    const a = { id: 1, slug: "a", title: "A" };
    let list = toggleCompare([], a, true).list;
    list = toggleCompare(list, { id: 2, slug: "b", title: "B" }, true).list;
    list = toggleCompare(list, { id: 3, slug: "c", title: "C" }, true).list;
    const full = toggleCompare(list, { id: 4, slug: "d", title: "D" }, true);
    expect(full.full).toBe(true);
    expect(full.list.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(toggleCompare(list, a, false).list.map((x) => x.id)).toEqual([2, 3]);
    expect(toggleCompare(list, a, true).list.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("parses stored items defensively", () => {
    expect(parseCompareItems('[{"id":1,"slug":"a","title":"A"},{"id":1,"slug":"a","title":"A"},{"id":"x"}]')).toEqual([
      { id: 1, slug: "a", title: "A" },
    ]);
    expect(parseCompareItems("{")).toEqual([]);
  });

  it("marks the cheapest only when prices differ", () => {
    expect(cheapestIndex([300, 200, null])).toBe(1);
    expect(cheapestIndex([200, 200])).toBeNull();
    expect(cheapestIndex([null, 100])).toBeNull();
  });
});
