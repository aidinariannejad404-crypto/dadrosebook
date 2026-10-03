import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/api";
import { siteUrl } from "@/lib/config";
import { buildSitemap } from "@/lib/sitemap";

// Rebuilt at most hourly; an API failure yields the home page only (never a 500).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let data = null;
  try {
    data = await getSitemapData();
  } catch {
    data = null;
  }
  return buildSitemap(siteUrl(), data);
}
