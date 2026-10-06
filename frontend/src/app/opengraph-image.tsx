import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { SITE_NAME } from "@/lib/config";
import { BRAND_GOLD, BRAND_NAVY, brandMarkDataUri, ogFonts } from "./brand-assets";

export const dynamic = "force-static";
export const alt = `${SITE_NAME} — منابع آزمون وکالت، قضاوت و سردفتری`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Satori (next/og) shapes Persian glyphs but has no bidi and over-measures joined Arabic-script words
 * (it draws each word from the box's left edge). So each line is a row-reverse flex of word boxes whose
 * widths were measured in Chromium with the same font files (src/fonts/og). If you change a tagline,
 * re-measure (unknown words fall back to satori's own, slightly wide, measurement). Avoid «،» and ZWNJ.
 */
const WORD_WIDTH_PER_PX: Record<string, number> = {
  منابع: 83 / 40,
  آزمون: 89 / 40,
  وکالت: 96 / 40,
  و: 18 / 40,
  قضاوت: 118 / 40,
  نسخه: 77 / 32,
  چاپی: 66 / 32,
  الکترونیک: 123 / 32,
  با: 20 / 32,
  ارسال: 72 / 32,
  سراسری: 107 / 32,
};

function RtlLine({ text, fontSize, gap, style }: { text: string; fontSize: number; gap: number; style: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap, fontSize, ...style }}>
      {text.split(/\s+/).map((word, i) => {
        const ratio = WORD_WIDTH_PER_PX[word];
        return (
          <span key={i} style={{ display: "flex", whiteSpace: "nowrap", ...(ratio ? { width: Math.ceil(ratio * fontSize) } : {}) }}>
            {word}
          </span>
        );
      })}
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
              {/* widths measured in Chromium (see WORD_WIDTH_PER_PX) */}
              <span style={{ display: "flex", width: 216 }}>کتاب</span>
              <span style={{ display: "flex", width: 212, color: BRAND_GOLD }}>دادرُز</span>
            </div>
            <RtlLine
              text="منابع آزمون وکالت و قضاوت"
              fontSize={40}
              gap={11}
              style={{ fontWeight: 500, color: "rgba(255,255,255,0.88)", marginTop: 8 }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 6, borderRadius: 3, background: BRAND_GOLD }} />
          <RtlLine
            text="نسخه چاپی و الکترونیک با ارسال سراسری"
            fontSize={32}
            gap={9}
            style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}
          />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
