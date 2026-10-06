import { sitemapIndexResponse } from "@/lib/sitemap-response";

// Sitemap index of the per-type sitemaps (package ب); rebuilt at most hourly.
export const revalidate = 3600;

export function GET(): Promise<Response> {
  return sitemapIndexResponse();
}
