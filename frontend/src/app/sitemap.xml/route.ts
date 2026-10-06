import { sitemapIndexResponse } from "@/lib/sitemap-response";

// Sitemap index of the per-type sitemaps (package ب). Rendered per request (data cached by fetch) so a build without the API never freezes an empty sitemap.
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return sitemapIndexResponse();
}
