import { sitemapSectionResponse } from "@/lib/sitemap-response";

// Per-type sitemap listed in /sitemap.xml (package ب). Rendered per request (data cached by fetch) so a build without the API never freezes an empty sitemap.
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return sitemapSectionResponse("books");
}
