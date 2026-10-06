import type { MetadataRoute } from "next";
import type { SitemapData, SitemapEntry } from "./types";
import { routes } from "./config";
import { NOINDEX_ROUTES } from "./seo";

/**
 * Sitemaps (Phase 5, split per type in package ب so Search Console shows indexing coverage per
 * type): `/sitemap.xml` is a sitemap index of `/sitemap-pages.xml` (home, kit, policy pages),
 * `/sitemap-books.xml`, `/sitemap-hubs.xml` (categories + exam/subject/author/publisher hubs) and
 * `/sitemap-content.xml` (guides, curated lists). Google ignores `priority`/`changefreq`, so only
 * `lastmod` is sent. Hubs arrive pre-filtered by the backend guardrail (only indexable pages).
 */

export const SITEMAP_KINDS = ["pages", "books", "hubs", "content"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export function sitemapPath(kind: SitemapKind): string {
  return `/sitemap-${kind}.xml`;
}

/** Indexable static pages (policy pages come from the help/policy package). */
export const STATIC_PAGES = ["/", routes.kit, "/about", "/shipping", "/returns", "/faq"] as const;

export interface SitemapUrl {
  url: string;
  lastModified?: Date;
  images?: string[];
}

/** Absolute URL for an image: API covers are absolute already; fixtures/local ones are site-relative. */
function absolute(site: string, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${site}${url.startsWith("/") ? "" : "/"}${url}`;
}

function lastModified(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function latest(dates: (Date | undefined)[]): Date | undefined {
  const times = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : undefined;
}

function entries(site: string, rows: SitemapEntry[] | undefined, path: (slug: string) => string): SitemapUrl[] {
  return (rows ?? []).map((r) => ({ url: `${site}${path(r.slug)}`, lastModified: lastModified(r.updated_at) }));
}

/** Newest date anywhere in the payload (for home/kit and the index). */
function newestOf(data: SitemapData | null): Date | undefined {
  if (!data) return undefined;
  const rows = [
    ...data.books,
    ...data.categories,
    ...data.exam_types,
    ...data.subjects,
    ...(data.authors ?? []),
    ...(data.publishers ?? []),
    ...(data.guides ?? []),
    ...(data.lists ?? []),
  ];
  return latest(rows.map((r) => lastModified(r.updated_at)));
}

export function buildPagesSitemap(site: string, data: SitemapData | null): SitemapUrl[] {
  const newest = newestOf(data);
  return STATIC_PAGES.map((path) => ({
    url: `${site}${path}`,
    // home and kit change with the catalogue; policy pages carry no reliable date
    ...(path === "/" || path === routes.kit ? (newest ? { lastModified: newest } : {}) : {}),
  }));
}

export function buildBooksSitemap(site: string, data: SitemapData | null): SitemapUrl[] {
  return (data?.books ?? []).map((b) => ({
    url: `${site}${routes.product(b.slug)}`,
    lastModified: lastModified(b.updated_at),
    ...(b.cover ? { images: [absolute(site, b.cover)] } : {}),
  }));
}

export function buildHubsSitemap(site: string, data: SitemapData | null): SitemapUrl[] {
  if (!data) return [];
  return [
    ...entries(site, data.categories, routes.category),
    ...entries(site, data.exam_types, routes.exam),
    ...entries(site, data.subjects, routes.subject),
    ...entries(site, data.authors, routes.author),
    ...entries(site, data.publishers, routes.publisher),
  ];
}

export function buildContentSitemap(site: string, data: SitemapData | null): SitemapUrl[] {
  if (!data) return [];
  return [...entries(site, data.guides, routes.guide), ...entries(site, data.lists, routes.list)];
}

export function buildSitemapSection(kind: SitemapKind, site: string, data: SitemapData | null): SitemapUrl[] {
  switch (kind) {
    case "pages":
      return buildPagesSitemap(site, data);
    case "books":
      return buildBooksSitemap(site, data);
    case "hubs":
      return buildHubsSitemap(site, data);
    case "content":
      return buildContentSitemap(site, data);
  }
}

/** Index entries: every section, with the newest lastmod of its URLs (sections stay listed when empty). */
export function buildSitemapIndex(site: string, data: SitemapData | null): SitemapUrl[] {
  return SITEMAP_KINDS.map((kind) => {
    const newest = latest(buildSitemapSection(kind, site, data).map((u) => u.lastModified));
    return { url: `${site}${sitemapPath(kind)}`, ...(newest ? { lastModified: newest } : {}) };
  });
}

/* ---------- XML ---------- */

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function lastmodTag(d: Date | undefined): string {
  return d ? `<lastmod>${d.toISOString()}</lastmod>` : "";
}

export function renderUrlset(urls: SitemapUrl[]): string {
  const body = urls
    .map(
      (u) =>
        `<url><loc>${escapeXml(u.url)}</loc>${lastmodTag(u.lastModified)}${(u.images ?? [])
          .map((img) => `<image:image><image:loc>${escapeXml(img)}</image:loc></image:image>`)
          .join("")}</url>`,
    )
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    (body ? `${body}\n` : "") +
    "</urlset>\n"
  );
}

export function renderSitemapIndex(sitemaps: SitemapUrl[]): string {
  const body = sitemaps
    .map((s) => `<sitemap><loc>${escapeXml(s.url)}</loc>${lastmodTag(s.lastModified)}</sitemap>`)
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${body}\n` +
    "</sitemapindex>\n"
  );
}

/** robots.txt rules: production allows crawling except personal routes; every other env blocks all. */
export function buildRobots(site: string, env: string | undefined): MetadataRoute.Robots {
  if (env !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...NOINDEX_ROUTES, "/api/"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
