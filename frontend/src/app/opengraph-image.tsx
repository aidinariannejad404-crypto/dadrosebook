import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { SITE_NAME } from "@/lib/config";
import { BRAND_GOLD, BRAND_NAVY, brandMarkDataUri, ogFonts } from "./brand-assets";

export const dynamic = "force-static";
export const alt = `${SITE_NAME} — منابع آزمون وکالت، قضاوت و سردفتری`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Satori (next/og) shapes Persian glyphs but has no bidi: it lays words out left to right.
 * Render each word as its own box in a row-reverse flex line so the sentence reads right to left.
 */
function RtlLine({ text, style, gap }: { text: string; style: CSSProperties; gap: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap, ...style }}>
      {text.split(/\s+/).map((word, i) => (
        <span key={i}>{word}</span>
      ))}
    </div>
  );
}

/** Default social card (1200×630): navy/gold, the brand mark, site name and tagline in local Vazirmatn. */
export default async function OpengraphImage() {
  const [mark, fonts] = await Promise.all([brandMarkDataUri(), ogFonts()]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          background: BRAND_NAVY,
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(200,162,75,0.22), transparent 45%), radial-gradient(circle at 95% 110%, rgba(255,255,255,0.08), transparent 40%)",
          padding: "80px 88px",
          fontFamily: "Vazirmatn",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 40 }}>
          <img src={mark} width={184} height={184} alt="" style={{ borderRadius: 44 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "row-reverse", gap: 26, fontSize: 104, fontWeight: 800, lineHeight: 1.15 }}>
              <span>کتاب</span>
              <span style={{ color: BRAND_GOLD }}>دادرُز</span>
            </div>
            <RtlLine
              text="منابع آزمون وکالت، قضاوت و سردفتری"
              gap={12}
              style={{ fontSize: 38, fontWeight: 500, color: "rgba(255,255,255,0.88)", marginTop: 8 }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 6, borderRadius: 3, background: BRAND_GOLD }} />
          <RtlLine
            text="نسخه چاپی، الکترونیک و بسته‌های مطالعاتی"
            gap={10}
            style={{ fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}
          />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
