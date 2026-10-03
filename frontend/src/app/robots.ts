import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { buildRobots } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl(), process.env.NEXT_PUBLIC_SITE_ENV);
}
