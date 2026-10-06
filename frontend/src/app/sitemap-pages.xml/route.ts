import { sitemapSectionResponse } from "@/lib/sitemap-response";

// Per-type sitemap listed in /sitemap.xml (package ب); rebuilt at most hourly.
export const revalidate = 3600;

export function GET(): Promise<Response> {
  return sitemapSectionResponse("pages");
}
