import { describe, expect, it } from "vitest";
import data from "./__fixtures__/sitemap.json";
import type { SitemapData } from "./types";
import {
  SITEMAP_KINDS,
  buildBooksSitemap,
  buildContentSitemap,
  buildHubsSitemap,
  buildPagesSitemap,
  buildRobots,
  buildSitemapIndex,
  escapeXml,
  renderSitemapIndex,
  renderUrlset,
  sitemapPath,
} from "./sitemap";

const SITE = "https://dadrosebook.com";
const base = data as SitemapData;
const withHubs: SitemapData = {
  ...base,
  exam_types: [{ slug: "کانون-وکلا", updated_at: "2026-10-01T10:00:00Z" }],
  subjects: [{ slug: "حقوق-مدنی", updated_at: "2026-09-01T10:00:00Z" }],
  authors: [{ slug: "مهدی-شکری", updated_at: "2026-09-02T10:00:00Z" }],
  publishers: [{ slug: "چتر-دانش", updated_at: "2026-09-03T10:00:00Z" }],
  guides: [{ slug: "بهترین-منابع", updated_at: "2026-10-04T10:00:00Z" }],
  lists: [{ slug: "سریع-خوان-ها", updated_at: "2026-10-03T10:00:00Z" }],
};

const ascii = /^[\x21-\x7e]+$/; // Persian slugs percent-encoded

describe("per-type sitemaps", () => {
  it("pages: home, kit and policy pages; API down still lists them", () => {
    const urls = buildPagesSitemap(SITE, null).map((u) => u.url);
    expect(urls).toEqual([`${SITE}/`, `${SITE}/kit`, `${SITE}/about`, `${SITE}/shipping`, `${SITE}/returns`, `${SITE}/faq`]);
    const pages = buildPagesSitemap(SITE, withHubs);
    expect(pages[0]!.lastModified).toEqual(new Date("2026-10-04T10:00:00Z")); // newest anywhere
    expect(pages[2]!.lastModified).toBeUndefined();
  });

  it("books: encoded URLs, lastmod from the API, absolute cover images", () => {
    const books = buildBooksSitemap(SITE, base);
    expect(books).toHaveLength(base.books.length);
    for (const b of books) expect(b.url).toMatch(ascii);
    expect(books[0]!.url).toBe(`${SITE}/product/${encodeURIComponent(base.books[0]!.slug)}`);
    expect(books[0]!.lastModified).toEqual(new Date(base.books[0]!.updated_at));
    expect(books[0]!.images?.[0]).toMatch(/^https:\/\//);
    const [noCover] = buildBooksSitemap(SITE, { ...base, books: [{ slug: "x", updated_at: "bad", cover: null }] });
    expect(noCover!.images).toBeUndefined();
    expect(noCover!.lastModified).toBeUndefined();
    expect(buildBooksSitemap(SITE, null)).toEqual([]);
  });

  it("hubs: categories + only the (pre-filtered) indexable exam/subject/author/publisher hubs", () => {
    const urls = buildHubsSitemap(SITE, withHubs).map((u) => u.url);
    expect(urls).toHaveLength(base.categories.length + 4);
    expect(urls).toContain(`${SITE}/exam/${encodeURIComponent("کانون-وکلا")}`);
    expect(urls).toContain(`${SITE}/subject/${encodeURIComponent("حقوق-مدنی")}`);
    expect(urls).toContain(`${SITE}/author/${encodeURIComponent("مهدی-شکری")}`);
    expect(urls).toContain(`${SITE}/publisher/${encodeURIComponent("چتر-دانش")}`);
    for (const u of urls) expect(u).toMatch(ascii);
    // an older backend without the new keys still works
    expect(buildHubsSitemap(SITE, base)).toHaveLength(base.categories.length + base.exam_types.length + base.subjects.length);
  });

  it("content: guides and lists", () => {
    expect(buildContentSitemap(SITE, withHubs).map((u) => u.url)).toEqual([
      `${SITE}/guide/${encodeURIComponent("بهترین-منابع")}`,
      `${SITE}/list/${encodeURIComponent("سریع-خوان-ها")}`,
    ]);
    expect(buildContentSitemap(SITE, base)).toEqual([]);
  });

  it("index lists every section with its newest lastmod", () => {
    const index = buildSitemapIndex(SITE, withHubs);
    expect(index.map((s) => s.url)).toEqual(SITEMAP_KINDS.map((k) => `${SITE}${sitemapPath(k)}`));
    expect(index[3]!.lastModified).toEqual(new Date("2026-10-04T10:00:00Z"));
    expect(buildSitemapIndex(SITE, null).map((s) => s.lastModified)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("XML", () => {
  it("renders a urlset with lastmod and image entries, no priority/changefreq", () => {
    const xml = renderUrlset([
      { url: `${SITE}/a?x=1&y=2`, lastModified: new Date("2026-10-01T00:00:00Z"), images: [`${SITE}/c.jpg`] },
      { url: `${SITE}/b` },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain(
      `<url><loc>${SITE}/a?x=1&amp;y=2</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod><image:image><image:loc>${SITE}/c.jpg</image:loc></image:image></url>`,
    );
    expect(xml).toContain(`<url><loc>${SITE}/b</loc></url>`);
    expect(xml).not.toMatch(/priority|changefreq/);
    expect(renderUrlset([])).toContain("<urlset");
  });

  it("renders a sitemap index", () => {
    const xml = renderSitemapIndex(buildSitemapIndex(SITE, null));
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain(`<sitemap><loc>${SITE}/sitemap-books.xml</loc></sitemap>`);
  });

  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });
});

describe("buildRobots", () => {
  it("blocks everything outside production", () => {
    expect(buildRobots(SITE, undefined)).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(buildRobots(SITE, "staging").rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
  it("production: allow / and disallow personal routes + /api/, with the sitemap index", () => {
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
