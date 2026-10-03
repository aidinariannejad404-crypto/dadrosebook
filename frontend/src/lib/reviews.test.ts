import { describe, expect, it } from "vitest";
import {
  aggregateRating,
  authorInitial,
  authorName,
  distributionRows,
  formatAverage,
  ratingText,
  starFills,
} from "./reviews";

describe("distributionRows", () => {
  it("returns 5→1 rows with whole percentages", () => {
    const rows = distributionRows({ distribution: { "5": 8, "4": 3, "3": 1, "2": 0, "1": 0 } });
    expect(rows.map((r) => r.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((r) => r.count)).toEqual([8, 3, 1, 0, 0]);
    expect(rows.map((r) => r.percent)).toEqual([67, 25, 8, 0, 0]);
  });
  it("is all zero without ratings and tolerates missing keys", () => {
    const rows = distributionRows({ distribution: {} as never });
    expect(rows.every((r) => r.percent === 0 && r.count === 0)).toBe(true);
  });
});

describe("formatAverage / ratingText", () => {
  it("uses Persian digits and decimal separator", () => {
    expect(formatAverage(4.6)).toBe("۴٫۶");
    expect(formatAverage(4.56)).toBe("۴٫۶");
    expect(formatAverage(5)).toBe("۵");
    expect(ratingText(4.5)).toBe("امتیاز ۴٫۵ از ۵");
  });
});

describe("starFills", () => {
  it("rounds to the nearest half", () => {
    expect(starFills(4.6)).toEqual(["full", "full", "full", "full", "half"]);
    expect(starFills(4.8)).toEqual(["full", "full", "full", "full", "full"]);
    expect(starFills(3.2)).toEqual(["full", "full", "full", "empty", "empty"]);
    expect(starFills(0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
    expect(starFills(9)).toHaveLength(5);
  });
});

describe("authors", () => {
  it("initial and fallback name", () => {
    expect(authorInitial("علی ر.")).toBe("ع");
    expect(authorInitial("  ")).toBe("؟");
    expect(authorName(" ")).toBe("کاربر دادرُز");
    expect(authorName("مریم ک.")).toBe("مریم ک.");
  });
});

describe("aggregateRating", () => {
  const dist = { "5": 3, "4": 0, "3": 0, "2": 0, "1": 0 };
  it("needs a real average over at least 3 reviews", () => {
    expect(aggregateRating(null)).toBeNull();
    expect(aggregateRating({ average: null, count: 2, distribution: dist })).toBeNull();
    expect(aggregateRating({ average: 4.56, count: 2, distribution: dist })).toBeNull();
    expect(aggregateRating({ average: 4.56, count: 12, distribution: dist })).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.6,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });
});
