import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { buildRobots } from "@/lib/sitemap";
import { withFacetDisallow } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // package الف۴: production rules also disallow sort/price/flag facet params (no-op for the block-all rule)
  return withFacetDisallow(buildRobots(siteUrl(), process.env.NEXT_PUBLIC_SITE_ENV));
}
