import { describe, expect, it } from "vitest";
import {
  QUOTE_MAX,
  QUOTE_LINE_HEIGHT,
  cardFileName,
  clampQuote,
  fitLine,
  layoutQuote,
  shortHost,
  wrapText,
  type Measure,
} from "./quote-card";

/** Every character is `size / 2` px wide (a fixed-pitch stand-in for canvas measureText). */
const mono: Measure = (text, size) => text.length * (size / 2);

describe("clampQuote", () => {
  it("squashes whitespace and keeps short quotes whole", () => {
    expect(clampQuote("  قرارداد   خصوصی\nنافذ است ")).toBe("قرارداد خصوصی نافذ است");
  });

  it("cuts at a word boundary with an ellipsis, never above the limit", () => {
    const text = Array.from({ length: 120 }, (_, i) => `واژه${i}`).join(" ");
    const out = clampQuote(text);
    expect(out.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1)).toBe(text.slice(0, out.length - 1));
    expect(text.charAt(out.length - 1)).toBe(" ");
  });

  it("cuts mid-word when there is no space late enough", () => {
    const out = clampQuote("ا".repeat(500), 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("honours a smaller limit (the granted quota)", () => {
    expect(clampQuote("یک دو سه چهار پنج", 9)).toBe("یک دو سه…");
    expect(clampQuote("یک دو سه چهار پنج", 12)).toBe("یک دو سه…");
  });
});

describe("wrapText", () => {
  it("wraps greedily by words", () => {
    // 10px font → 5px per char; 40px fits 8 chars
    expect(wrapText("aaa bbb ccc dd", 40, 10, mono)).toEqual(["aaa bbb", "ccc dd"]);
  });

  it("keeps ZWNJ words together and splits a word longer than the line", () => {
    expect(wrapText("می‌شود", 100, 10, mono)).toEqual(["می‌شود"]);
    expect(wrapText("abcdefghij", 20, 10, mono)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("returns no lines for empty text", () => {
    expect(wrapText("   ", 100, 10, mono)).toEqual([]);
  });
});

describe("layoutQuote", () => {
  it("uses the largest size that fits", () => {
    const out = layoutQuote("کوتاه", { maxWidth: 800, maxHeight: 600, measure: mono, sizes: [64, 40] });
    expect(out).toEqual({ fontSize: 64, lines: ["کوتاه"], truncated: false });
  });

  it("steps down the size for longer quotes and stays inside the box", () => {
    const text = Array.from({ length: 40 }, () => "کلمه").join(" ");
    const box = { maxWidth: 400, maxHeight: 400 };
    const out = layoutQuote(text, { ...box, measure: mono, sizes: [64, 40, 20] });
    expect(out.truncated).toBe(false);
    expect(out.fontSize).toBeLessThan(64);
    expect(out.lines.length * out.fontSize * QUOTE_LINE_HEIGHT).toBeLessThanOrEqual(box.maxHeight);
    for (const line of out.lines) expect(mono(line, out.fontSize)).toBeLessThanOrEqual(box.maxWidth);
    expect(out.lines.join(" ")).toBe(text);
  });

  it("truncates with an ellipsis when even the smallest size does not fit", () => {
    const text = "x ".repeat(280).trim();
    const out = layoutQuote(text, { maxWidth: 100, maxHeight: 100, measure: mono, sizes: [20] });
    expect(out.truncated).toBe(true);
    expect(out.lines).toHaveLength(Math.floor(100 / (20 * QUOTE_LINE_HEIGHT)));
    expect(out.lines.at(-1)!.endsWith("…")).toBe(true);
    for (const line of out.lines) expect(mono(line, 20)).toBeLessThanOrEqual(100);
  });

  it("never draws more than QUOTE_MAX characters", () => {
    const out = layoutQuote("ب".repeat(1000), { maxWidth: 10_000, maxHeight: 10_000, measure: mono, sizes: [10] });
    expect(out.lines.join("").length).toBeLessThanOrEqual(QUOTE_MAX);
  });
});

describe("fitLine / shortHost / cardFileName", () => {
  it("cuts a title to one line", () => {
    expect(fitLine("short", 100, 10, mono)).toBe("short");
    const cut = fitLine("a very long book title", 50, 10, mono);
    expect(cut.endsWith("…")).toBe(true);
    expect(mono(cut, 10)).toBeLessThanOrEqual(50);
  });

  it("shows the bare host", () => {
    expect(shortHost("https://www.dadrosebook.com/")).toBe("dadrosebook.com");
    expect(shortHost("http://localhost:3105")).toBe("localhost:3105");
    expect(shortHost("not a url/path")).toBe("not a url");
  });

  it("builds a safe file name", () => {
    expect(cardFileName("civil-law")).toBe("نقل-قول-civil-law.png");
    expect(cardFileName("a/b")).toBe("نقل-قول-ab.png");
  });
});
