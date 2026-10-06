import { describe, expect, it } from "vitest";
import { completeSubjects, newlyComplete, shouldBump } from "./kit-complete";
import type { StudyKit } from "./types";

const kit = (slug: string, items: [number, boolean][]): StudyKit =>
  ({
    exam_type: { id: 1, name: "کانون", slug: "kanoon", short_name: "کانون" },
    subject: { id: slug.length, name: slug, slug, color: "#000" },
    note: "",
    weight: null,
    items: items.map(([id, is_essential], order) => ({ order, is_essential, book: { id } })),
  }) as unknown as StudyKit;

describe("kit completion", () => {
  const kits = [kit("civil", [[1, true], [2, true], [3, false]]), kit("crim", [[4, false]]), kit("trade", [[5, true]])];

  it("needs every essential book in the cart", () => {
    expect([...completeSubjects(kits, new Set([1, 3]))]).toEqual([]);
    expect([...completeSubjects(kits, new Set([1, 2]))]).toEqual(["civil"]);
    expect([...completeSubjects(kits, new Set([1, 2, 4, 5]))]).toEqual(["civil", "trade"]);
  });

  it("celebrates only transitions after the first load", () => {
    expect(newlyComplete(null, new Set(["civil"]))).toEqual([]);
    expect(newlyComplete(new Set(["civil"]), new Set(["civil", "trade"]))).toEqual(["trade"]);
    expect(newlyComplete(new Set(["civil"]), new Set())).toEqual([]);
  });

  it("bumps the badge only when the count rises", () => {
    expect(shouldBump(null, 3)).toBe(false);
    expect(shouldBump(2, 3)).toBe(true);
    expect(shouldBump(3, 2)).toBe(false);
    expect(shouldBump(3, 3)).toBe(false);
  });
});
