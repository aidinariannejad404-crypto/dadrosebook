import { describe, expect, it } from "vitest";
import data from "./__fixtures__/sitemap.json";
import type { SitemapData } from "./types";
import { buildRobots, buildSitemap } from "./sitemap";

const SITE = "https://dadrosebook.com";

describe("buildSitemap", () => {
  it("API down → home only", () => {
    expect(buildSitemap(SITE, null)).toEqual([{ url: `${SITE}/`, changeFrequency: "daily", priority: 1 }]);
  });

  const map = buildSitemap(SITE, data as SitemapData);

  it("lists home, kit, every book and category with absolute, encoded URLs", () => {
    const urls = map.map((e) => e.url);
    expect(urls[0]).toBe(`${SITE}/`);
    expect(urls[1]).toBe(`${SITE}/kit`);
    expect(map).toHaveLength(2 + data.books.length + data.categories.length);
    for (const u of urls) {
      expect(u.startsWith(`${SITE}/`)).toBe(true);
      expect(u).toMatch(/^[\x21-\x7e]+$/); // ASCII only: Persian slugs percent-encoded
    }
    const first = data.books[0]!;
    expect(urls).toContain(`${SITE}/product/${encodeURIComponent(first.slug)}`);
    expect(urls).toContain(`${SITE}/category/${encodeURIComponent(data.categories[0]!.slug)}`);
  });

  it("takes lastModified from the API and puts absolute covers in images", () => {
    const book = map[2]!;
    expect(book.lastModified).toEqual(new Date(data.books[0]!.updated_at));
    expect(book.images?.[0]).toMatch(/^https:\/\//);
    const noCover = buildSitemap(SITE, {
      books: [{ slug: "x", updated_at: "bad", cover: null }],
      categories: [],
      subjects: [],
      exam_types: [],
    })[2]!;
    expect(noCover.images).toBeUndefined();
    expect(noCover.lastModified).toBeUndefined();
  });
});

describe("buildRobots", () => {
  it("blocks everything outside production", () => {
    expect(buildRobots(SITE, undefined)).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(buildRobots(SITE, "staging").rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
  it("production: allow / and disallow personal routes + /api/, with sitemap", () => {
    const r = buildRobots(SITE, "production");
    expect(r.rules).toEqual([
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/cart", "/checkout", "/account", "/login", "/read", "/plan", "/api/"],
      },
    ]);
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});
