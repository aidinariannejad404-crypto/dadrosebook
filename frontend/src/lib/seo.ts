import type { Metadata, MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "./config";

/**
 * SEO rules shared by every page (docs/phase-5-contract.md §4).
 * Pages that must not be indexed export `metadata = { ..., robots: NOINDEX }` (or use `noindexMetadata`).
 */

/** Path prefixes that are never indexed; robots.txt disallows them in production too. */
export const NOINDEX_ROUTES = ["/cart", "/checkout", "/account", "/login", "/read", "/plan", "/gift"] as const; // growth: /gift

/** `noindex, nofollow` for personal/transactional pages (cart, checkout, account, login, reader, plan, 404). */
export const NOINDEX: NonNullable<Metadata["robots"]> = { index: false, follow: false, nocache: true };

/** `noindex, follow` for thin variants of indexable pages (e.g. /search with filters other than q). */
export const NOINDEX_FOLLOW: NonNullable<Metadata["robots"]> = { index: false, follow: true };

/** Default for indexable pages (set once in the root layout). */
export const INDEX: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
};

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * /search is never indexed (Google: keep internal search results out of the index): every state,
 * with or without `q`, is `noindex, follow` and canonicalises to /search. Kept as a function so the
 * rule lives in one tested place.
 */
export function searchRobots(): NonNullable<Metadata["robots"]> {
  return NOINDEX_FOLLOW;
}

export function noindexMetadata(title: string): Metadata {
  return { title, robots: NOINDEX };
}

/** Root Open Graph defaults; a page that sets `openGraph` replaces the whole object, so spread this. */
export const DEFAULT_OPEN_GRAPH = {
  type: "website",
  locale: "fa_IR",
  siteName: SITE_NAME,
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
} as const satisfies NonNullable<Metadata["openGraph"]>;

/* ---------- Package الف (SEO builder): facet crawl control + clean canonicals ---------- */

/**
 * Listing params nobody searches for (sort, price range, flags). Google's faceted-navigation guide
 * (12/2024) prefers robots.txt over noindex/canonical for these, so they are disallowed in production.
 * Subject/exam/format filters stay crawlable (noindex, follow) so their links are still followed.
 */
export const FACET_DISALLOW_PARAMS = ["ordering", "min_price", "max_price", "in_stock", "has_sample", "quick_review"] as const;

/** robots.txt patterns: the param anywhere in the query string ("/*?*ordering=" also matches "&ordering="). */
export function facetDisallowRules(): string[] {
  return FACET_DISALLOW_PARAMS.map((p) => `/*?*${p}=`);
}

/** Add the facet rules to every rule that allows crawling (production); a block-all rule stays as it is. */
export function withFacetDisallow(robots: MetadataRoute.Robots): MetadataRoute.Robots {
  type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[]; crawlDelay?: number };
  const extend = <R extends Rule>(rule: R): R => {
    const disallow = rule.disallow === undefined ? [] : Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    if (disallow.includes("/")) return rule;
    return { ...rule, disallow: [...disallow, ...facetDisallowRules().filter((r) => !disallow.includes(r))] };
  };
  const rules = Array.isArray(robots.rules) ? robots.rules.map(extend) : extend(robots.rules);
  return { ...robots, rules };
}

/** The only query param a canonical URL may carry (self-canonical pagination); utm_*, ref, filters never. */
const CANONICAL_PARAMS = ["page"] as const;

/**
 * Canonical path for `path` + params: drops tracking (utm_*, ref, fbclid…), filters and sort, keeps
 * `page` > 1 only, and removes a trailing slash (except for "/").
 */
export function canonicalPath(path: string, params: Record<string, string | number | undefined | null> = {}): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
  const qs = new URLSearchParams();
  for (const key of CANONICAL_PARAMS) {
    const raw = params[key];
    const n = Number(raw);
    if (key === "page" && Number.isInteger(n) && n > 1) qs.set(key, String(n));
  }
  const q = qs.toString();
  return q ? `${clean}?${q}` : clean;
}
