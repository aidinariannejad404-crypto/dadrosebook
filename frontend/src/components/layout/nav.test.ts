import { describe, expect, it } from "vitest";
import { matchesPath } from "./HideOn";
import { navState } from "./NavLink";
import { BOTTOM_NAV_HIDDEN } from "./BottomNav";

describe("matchesPath", () => {
  it("matches exact paths and sub-paths of prefixes only", () => {
    expect(matchesPath("/checkout", { exact: ["/checkout"] })).toBe(true);
    expect(matchesPath("/checkout/result", { exact: ["/checkout"] })).toBe(false);
    expect(matchesPath("/read/x", { prefixes: ["/read"] })).toBe(true);
    expect(matchesPath("/reader", { prefixes: ["/read"] })).toBe(false);
  });

  it("hides the bottom nav on product, checkout and reader pages", () => {
    for (const p of ["/product/a", "/checkout", "/checkout/result", "/read/b"]) expect(matchesPath(p, BOTTOM_NAV_HIDDEN)).toBe(true);
    for (const p of ["/", "/cart", "/kit", "/category/x", "/account"]) expect(matchesPath(p, BOTTOM_NAV_HIDDEN)).toBe(false);
  });
});

describe("navState", () => {
  const href = "/category/" + encodeURIComponent("آزمون-وکالت");
  it("compares decoded Persian slugs", () => {
    expect(navState("/category/آزمون-وکالت", href)).toBe("page");
    expect(navState(href + "/", href)).toBe("page");
  });
  it("marks the parent of the current sub-category", () => {
    const child = "/category/" + encodeURIComponent("منابع-اصلی");
    expect(navState(child, href, [child])).toBe("true");
    expect(navState("/kit", href, [child])).toBe(false);
  });
});
