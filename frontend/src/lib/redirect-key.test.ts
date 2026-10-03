import { describe, expect, it } from "vitest";
import { redirectKey } from "./redirect-key";

// Same cases as backend/apps/seo/tests (Python `redirect_key`): keep both lists in sync.
const CASES: [string, string][] = [
  ["/", "/"],
  ["", "/"],
  ["/product/حقوق-مدنی", "/product/حقوق-مدنی"],
  // percent-encoded Persian
  ["/product/%D8%AD%D9%82%D9%88%D9%82-%D9%85%D8%AF%D9%86%DB%8C", "/product/حقوق-مدنی"],
  // double-encoded
  ["/product/%25D8%25AD%25D9%2582%25D9%2588%25D9%2582", "/product/حقوق"],
  // Arabic yeh / alef maksura / kaf
  ["/product/كتاب-مدني", "/product/کتاب-مدنی"],
  ["/category/فتوى", "/category/فتوی"],
  // trailing slash, query and fragment
  ["/product/abc/", "/product/abc"],
  ["/product/abc/?utm_source=x#top", "/product/abc"],
  ["/?a=1", "/"],
  // double slashes
  ["//product//abc//", "/product/abc"],
  // ASCII lowercased, Persian untouched
  ["/Products/ABC", "/products/abc"],
  // space and ZWNJ → "-"
  ["/category/حقوق مدنی", "/category/حقوق-مدنی"],
  ["/category/کتاب‌های-حقوقی", "/category/کتاب-های-حقوقی"],
  ["/category/%DA%A9%D8%AA%D8%A7%D8%A8%E2%80%8C%D9%87%D8%A7", "/category/کتاب-ها"],
  ["/search%20page", "/search-page"],
  // digits are kept as they are
  ["/product/۱۲۳", "/product/۱۲۳"],
];

// Mirror of backend/apps/seo/tests/test_keys.py (Python `quote` keeps "/").
const PRODUCT = "/product/آیین-دادرسی-مدنی";
const quote = (s: string) => encodeURIComponent(s).replace(/%2F/g, "/");
const BACKEND_CASES: [string, string][] = [
  ["//", "/"],
  [PRODUCT, PRODUCT],
  [quote(PRODUCT), PRODUCT],
  [quote(PRODUCT).toLowerCase(), PRODUCT],
  [quote(quote(PRODUCT)), PRODUCT],
  [quote(quote(quote(PRODUCT))), PRODUCT],
  ["/product/آيين-دادرسي-مدني", PRODUCT],
  ["/category/كتاب", "/category/کتاب"],
  ["/category/حقوق-مدنى", "/category/حقوق-مدنی"],
  [PRODUCT + "/", PRODUCT],
  [PRODUCT + "?utm_source=x&page=2", PRODUCT],
  [PRODUCT + "/?a=1#top", PRODUCT],
  [quote(PRODUCT) + "%3Fa%3D1", PRODUCT + "?a=1"], // an encoded "?" is part of the path
  ["//product///" + PRODUCT.slice("/product/".length), PRODUCT],
  ["/Page/About-Us", "/page/about-us"],
  ["/product/سریع خوان", "/product/سریع-خوان"],
  ["/product/سریع\u200cخوان", "/product/سریع-خوان"],
  ["/product/سریع%20خوان", "/product/سریع-خوان"],
  ["/product/۱۱۰۰-تست", "/product/۱۱۰۰-تست"],
  ["/product/1100-تست", "/product/1100-تست"],
  ["/product/Essentials-of-Civil-Law", "/product/essentials-of-civil-law"],
];

describe("redirectKey (backend parity)", () => {
  it.each(BACKEND_CASES)("%s → %s", (input, expected) => {
    expect(redirectKey(input)).toBe(expected);
  });

  it("stops decoding after three rounds", () => {
    expect(redirectKey(quote(quote(quote(quote("/ا")))))).toBe(quote("/ا").toLowerCase());
  });
});

describe("redirectKey", () => {
  it.each(CASES)("%s → %s", (input, expected) => {
    expect(redirectKey(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const [input] of CASES) {
      const once = redirectKey(input);
      expect(redirectKey(once)).toBe(once);
    }
  });

  it("tolerates malformed escapes", () => {
    // malformed input is a corner case where the Python copy may differ; it only must not throw
    expect(redirectKey("/a%E0%A4%A/%D8%AD").endsWith("/ح")).toBe(true);
  });
});
