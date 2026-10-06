// PF-14: PWA PNG icons from the brand mark (public/brand/logo-mark.svg). Re-run after a rebrand:
//   node scripts/generate-pwa-icons.mjs
// Writes public/icons/icon-{192,512}.png (purpose "any") and icon-maskable-512.png (mark inside
// the 80% safe zone on the brand navy, purpose "maskable"). Uses sharp (already a Next.js dependency).
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const svg = await readFile(path.join(root, "public/brand/logo-mark.svg"));
const out = path.join(root, "public/icons");
const NAVY = "#12264A";
await mkdir(out, { recursive: true });

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, `icon-${size}.png`));
}

const inner = Math.round(512 * 0.8);
const mark = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: NAVY } })
  .composite([{ input: mark, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, "icon-maskable-512.png"));

console.log("PWA icons written to public/icons/");
