import { describe, expect, it } from "vitest";
import { encodePath, parseRedirectPayload, resolveRedirect, shouldCheckRedirect, type RedirectMap } from "./redirects";

const MAP: RedirectMap = {
  "/products": ["/search", 301],
  "/product/کتاب-قدیمی": ["/product/کتاب-جدید", 301],
  "/category/دوره-های-آموزشی": ["https://dadrose.com/", 301],
  "/blog": ["https://dadrose.com/blog/?from=book", 302],
  "/insecure": ["http://example.com/", 301],
  "/self": ["/self/", 301],
  "/with-query": ["/search?ordering=-sales_count", 301],
  "/js": ["javascript:alert(1)", 301],
  "/odd": ["/", 307],
};

describe("resolveRedirect", () => {
  it("returns null for unknown paths", () => {
    expect(resolveRedirect(MAP, "/product/x")).toBeNull();
    expect(resolveRedirect({}, "/products")).toBeNull();
  });

  it("matches by redirect key (encoded Persian, ك, trailing slash)", () => {
    const encoded = "/product/%DA%A9%D8%AA%D8%A7%D8%A8-%D9%82%D8%AF%DB%8C%D9%85%DB%8C/";
    const d = resolveRedirect(MAP, encoded);
    expect(d?.status).toBe(301);
    expect(d?.key).toBe("/product/کتاب-قدیمی");
    expect(decodeURIComponent(d!.location)).toBe("/product/کتاب-جدید");
    expect(d!.location).toBe(encodePath("/product/کتاب-جدید"));
    expect(resolveRedirect(MAP, "/product/كتاب-قديمي")?.key).toBe("/product/کتاب-قدیمی");
    expect(resolveRedirect(MAP, "/Products/")?.location).toBe("/search");
  });

  it("preserves the query string for internal targets", () => {
    expect(resolveRedirect(MAP, "/products", "?q=مدنی&utm_source=x")?.location).toBe(
      "/search?q=%D9%85%D8%AF%D9%86%DB%8C&utm_source=x",
    );
    expect(resolveRedirect(MAP, "/with-query", "?ordering=price&page=2")?.location).toBe(
      "/search?ordering=-sales_count&page=2",
    );
  });

  it("uses absolute https targets as they are (no query forwarding)", () => {
    expect(resolveRedirect(MAP, "/category/دوره-های-آموزشی", "?a=1")).toEqual({
      location: "https://dadrose.com/",
      status: 301,
      key: "/category/دوره-های-آموزشی",
    });
    expect(resolveRedirect(MAP, "/blog")?.status).toBe(302);
  });

  it("refuses non-https absolute targets, self-redirects; unknown status → 301", () => {
    expect(resolveRedirect(MAP, "/insecure")).toBeNull();
    expect(resolveRedirect(MAP, "/js")).toBeNull();
    expect(resolveRedirect(MAP, "/self")).toBeNull();
    expect(resolveRedirect(MAP, "/odd")?.status).toBe(301);
  });
});

describe("shouldCheckRedirect", () => {
  it.each([
    ["/", true],
    ["/product/abc", true],
    ["/page/about-us.html", true],
    ["/index.php", true],
    ["/_next/static/x.js", false],
    ["/api/v1/x", false],
    ["/static/a", false],
    ["/media/a.jpg", false],
    ["/favicon.ico", false],
    ["/sitemap.xml", false],
    ["/robots.txt", false],
    ["/product/کتاب.ویرایش-دوم", true],
  ])("%s → %s", (path, expected) => {
    // "کتاب.ویرایش-دوم" has a dot but a Persian "extension": still a page
    expect(shouldCheckRedirect(path)).toBe(expected === true ? true : false);
  });
});

describe("parseRedirectPayload", () => {
  it("drops malformed rows", () => {
    expect(
      parseRedirectPayload({ version: "x", redirects: { "/a": ["/b", 302], "/c": "nope", "/d": ["/e"] } }),
    ).toEqual({ "/a": ["/b", 302], "/d": ["/e", 301] });
    expect(parseRedirectPayload(null)).toEqual({});
    expect(parseRedirectPayload({ redirects: [] })).toEqual({});
  });
});
