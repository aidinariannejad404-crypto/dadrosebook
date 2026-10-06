import { getSitemapData } from "./api";
import { siteUrl } from "./config";
import type { SitemapData } from "./types";
import { buildSitemapIndex, buildSitemapSection, renderSitemapIndex, renderUrlset, type SitemapKind } from "./sitemap";

/** Shared by the /sitemap*.xml route handlers. An API failure yields a valid, smaller sitemap (never a 500). */
async function loadData(): Promise<SitemapData | null> {
  try {
    return await getSitemapData();
  } catch {
    return null;
  }
}

function xml(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

export async function sitemapIndexResponse(): Promise<Response> {
  return xml(renderSitemapIndex(buildSitemapIndex(siteUrl(), await loadData())));
}

export async function sitemapSectionResponse(kind: SitemapKind): Promise<Response> {
  return xml(renderUrlset(buildSitemapSection(kind, siteUrl(), await loadData())));
}
