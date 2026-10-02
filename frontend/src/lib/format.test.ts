import { describe, expect, it } from "vitest";
import { daysUntil, formatJalaliDate, formatNumber, formatPercent, formatToman, toPersianDigits } from "./format";

describe("toPersianDigits", () => {
  it("converts ASCII digits", () => {
    expect(toPersianDigits("1405/08/14")).toBe("۱۴۰۵/۰۸/۱۴");
    expect(toPersianDigits(1234567890)).toBe("۱۲۳۴۵۶۷۸۹۰");
  });
  it("converts Arabic-Indic digits and keeps other text", () => {
    expect(toPersianDigits("صفحه ٤٥")).toBe("صفحه ۴۵");
  });
});

describe("formatToman", () => {
  it("formats with Persian digits and U+066C separators", () => {
    expect(formatToman(2200000)).toBe("۲٬۲۰۰٬۰۰۰ تومان");
    expect(formatToman(2200000)).toContain("٬");
    expect(formatToman(8125000)).toBe("۸٬۱۲۵٬۰۰۰ تومان");
  });
  it("handles small numbers and zero", () => {
    expect(formatToman(0)).toBe("۰ تومان");
    expect(formatToman(950)).toBe("۹۵۰ تومان");
    expect(formatToman(1000)).toBe("۱٬۰۰۰ تومان");
  });
  it("formatNumber handles negatives", () => {
    expect(formatNumber(-12500)).toBe("-۱۲٬۵۰۰");
  });
});

describe("formatJalaliDate", () => {
  it("formats the bar exam date", () => {
    expect(formatJalaliDate("2026-11-05")).toBe("۱۴ آبان ۱۴۰۵");
  });
  it("formats Nowruz", () => {
    expect(formatJalaliDate("2026-03-21")).toBe("۱ فروردین ۱۴۰۵");
  });
  it("accepts a custom pattern", () => {
    expect(formatJalaliDate("2026-11-05", "yyyy/MM/dd")).toBe("۱۴۰۵/۰۸/۱۴");
  });
});

describe("daysUntil", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-11-05", new Date(2026, 9, 2, 23, 59))).toBe(34);
    expect(daysUntil("2026-11-05", new Date(2026, 10, 5, 8, 0))).toBe(0);
    expect(daysUntil("2026-11-05", new Date(2026, 10, 6))).toBe(-1);
  });
});

describe("formatPercent", () => {
  it("uses Persian digits and percent sign", () => {
    expect(formatPercent(11)).toBe("۱۱٪");
  });
});
