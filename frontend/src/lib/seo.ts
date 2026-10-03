import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "./config";

/**
 * SEO rules shared by every page (docs/phase-5-contract.md §4).
 * Pages that must not be indexed export `metadata = { ..., robots: NOINDEX }` (or use `noindexMetadata`).
 */

/** Path prefixes that are never indexed; robots.txt disallows them in production too. */
export const NOINDEX_ROUTES = ["/cart", "/checkout", "/account", "/login", "/read", "/plan"] as const;

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
 * /search: indexable only with no params or just `q` (and `page`); any other filter → noindex, follow.
 * Returns the robots value to put in the page's metadata.
 */
export function searchRobots(params: Record<string, string | string[] | undefined>): NonNullable<Metadata["robots"]> {
  const keys = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k]) => k);
  return keys.every((k) => k === "q" || k === "page") ? INDEX : NOINDEX_FOLLOW;
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
