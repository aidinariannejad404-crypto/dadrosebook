import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { getSharedKit } from "@/lib/api";
import { sharedKitParams } from "@/lib/growth";
import { parseExamSlug } from "@/lib/exam-cookie";
import { BRAND_GOLD, BRAND_NAVY, ogFonts } from "../../brand-assets";

/**
 * و۳: Open Graph image of a shared kit (1200×630) — up to six covers on the brand navy. Covers without
 * an uploaded image are drawn like BookCover: the subject colour with the title. Satori has no bidi, so
 * Persian lines are row-reverse flexes of words (see app/opengraph-image.tsx).
 */

const MAX_COVERS = 6;
const FALLBACK_COLOR = "#3F4A5E";

function Words({ text, style }: { text: string; style: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", ...style }}>
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((w, i) => (
          <span key={i} style={{ display: "flex", whiteSpace: "nowrap", marginLeft: 6 }}>
            {w}
          </span>
        ))}
    </div>
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const params = sharedKitParams(sp);
  const kit = params ? await getSharedKit(params, parseExamSlug(sp.exam)).catch(() => null) : null;
  const books = (kit?.items ?? []).slice(0, MAX_COVERS).map((i) => i.book);
  const fonts = await ogFonts();
  const examName = kit?.exam?.name;

  const coverW = books.length > 4 ? 150 : 180;
  const coverH = Math.round(coverW * 1.42);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          background: BRAND_NAVY,
          backgroundImage: "radial-gradient(circle at 12% 18%, rgba(200,162,75,0.22), transparent 45%)",
          padding: "56px 64px",
          fontFamily: "Vazirmatn",
          color: "#fff",
        }}
      >
        <Words text={examName ? `کیت مطالعاتی آزمون ${examName}` : "کیت مطالعاتی آزمون"} style={{ fontSize: 52, fontWeight: 800 }} />
        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 22, alignItems: "flex-end" }}>
          {books.length === 0 && <Words text="کتاب دادرُز" style={{ fontSize: 64, fontWeight: 800, color: BRAND_GOLD }} />}
          {books.map((b) =>
            b.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={b.id} src={b.cover} width={coverW} height={coverH} alt="" style={{ borderRadius: 10, objectFit: "cover" }} />
            ) : (
              <div
                key={b.id}
                style={{
                  width: coverW,
                  height: coverH,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: 14,
                  borderRadius: 10,
                  background: b.subjects[0]?.color ?? FALLBACK_COLOR,
                  borderRight: `10px solid rgba(0,0,0,0.25)`,
                  boxShadow: "0 18px 30px rgba(0,0,0,0.35)",
                }}
              >
                <Words text={b.title} style={{ fontSize: books.length > 4 ? 20 : 24, fontWeight: 800, lineHeight: 1.5 }} />
              </div>
            ),
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 18 }}>
          <Words text="با یک لمس همه را به سبد اضافه کن" style={{ fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.9)" }} />
          <div style={{ display: "flex", background: BRAND_GOLD, color: BRAND_NAVY, borderRadius: 999, padding: "6px 22px" }}>
            <Words text="کتاب دادرُز" style={{ fontSize: 28, fontWeight: 800 }} />
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
