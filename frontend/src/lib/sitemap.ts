import type { MetadataRoute } from "next";
import type { SitemapData } from "./types";
import { routes } from "./config";
import { NOINDEX_ROUTES } from "./seo";

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

/**
 * sitemap.xml entries (docs/phase-5-contract.md §4): home, /kit, every book and category.
 * `data` null (API down) → home only. Persian slugs are percent-encoded via `routes`.
 */
export function buildSitemap(site: string, data: SitemapData | null): MetadataRoute.Sitemap {
  if (!data) return [{ url: `${site}/`, changeFrequency: "daily", priority: 1 }];
  const books = data.books.map((b) => ({
    url: `${site}${routes.product(b.slug)}`,
    lastModified: lastModified(b.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
    ...(b.cover ? { images: [absolute(site, b.cover)] } : {}),
  }));
  const categories = data.categories.map((c) => ({
    url: `${site}${routes.category(c.slug)}`,
    lastModified: lastModified(c.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  const newest = latest([...books, ...categories].map((e) => e.lastModified));
  return [
    { url: `${site}/`, lastModified: newest, changeFrequency: "daily", priority: 1 },
    { url: `${site}${routes.kit}`, lastModified: newest, changeFrequency: "weekly", priority: 0.9 },
    ...books,
    ...categories,
  ];
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
