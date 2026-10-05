import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Build-time helpers for the generated icons / OG image. They read the brand mark from
 * public/brand/logo-mark.svg (replace that file to rebrand) and the self-hosted Vazirmatn
 * static instances in src/fonts/og/ (satori cannot read woff2 or variable fonts).
 */
export const BRAND_NAVY = "#12264A";
export const BRAND_GOLD = "#C8A24B";

export async function brandMarkDataUri(): Promise<string> {
  const svg = await readFile(path.join(process.cwd(), "public/brand/logo-mark.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

export async function ogFonts() {
  const dir = path.join(process.cwd(), "src/fonts/og");
  const [bold, medium] = await Promise.all([
    readFile(path.join(dir, "Vazirmatn-ExtraBold.woff")),
    readFile(path.join(dir, "Vazirmatn-Medium.woff")),
  ]);
  return [
    { name: "Vazirmatn", data: bold, weight: 800 as const, style: "normal" as const },
    { name: "Vazirmatn", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}
