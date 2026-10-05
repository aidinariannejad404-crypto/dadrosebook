import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME } from "@/lib/config";

export const dynamic = "force-static";

/** PWA manifest. Icons come from the brand mark (public/brand/logo-mark.svg) and the generated apple icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6F9",
    theme_color: "#12264A",
    categories: ["books", "education", "shopping"],
    icons: [
      { src: "/brand/logo-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
