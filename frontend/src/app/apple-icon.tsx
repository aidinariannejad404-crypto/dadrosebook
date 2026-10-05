import { ImageResponse } from "next/og";
import { BRAND_NAVY, brandMarkDataUri } from "./brand-assets";

export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the brand mark (public/brand/logo-mark.svg) on a full-bleed navy square. */
export default async function AppleIcon() {
  const mark = await brandMarkDataUri();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_NAVY }}>
        <img src={mark} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
