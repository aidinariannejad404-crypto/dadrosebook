import { ImageResponse } from "next/og";
import { BRAND_NAVY, brandMarkDataUri } from "../brand-assets";
import { LOGO_SIZE } from "@/lib/jsonld";

export const dynamic = "force-static";

/**
 * /logo.png — 512×512 raster logo for Organization.logo (package الف۲). Google wants a crawlable
 * PNG/JPG of at least 112×112 (no SVG). Rendered at build time from public/brand/logo-mark.svg, so
 * replacing that file rebrands this image too.
 */
export async function GET() {
  const mark = await brandMarkDataUri();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_NAVY }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori (ImageResponse) needs a plain img */}
        <img src={mark} width={LOGO_SIZE} height={LOGO_SIZE} alt="" />
      </div>
    ),
    { width: LOGO_SIZE, height: LOGO_SIZE },
  );
}
