// PF-16: fail when frontend/src ships hard-coded crypto keys or IVs (Fidibo's legacy client did;
// its keys are public on GitHub). Offline reading must keep using non-extractable WebCrypto keys
// generated in the browser and server-issued licences. Run by `npm run lint` (and lint:crypto);
// mirrored by backend/apps/core/tests/test_frontend_crypto_guard.py.
// Silence a deliberate test vector with a trailing `// crypto-guard: allow` comment.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const NAME = String.raw`(?:key|iv|nonce|salt|secret|aes|cipher)\w*`;
export const PATTERNS = [
  new RegExp(String.raw`\b${NAME}\s*[:=]\s*["'\`](?:[0-9a-f]{32,}|[A-Za-z0-9+/]{22,}={0,2})["'\`]`, "i"),
  new RegExp(String.raw`\b${NAME}\s*[:=]\s*new\s+Uint8Array\(\s*\[\s*(?:\d+\s*,\s*){7,}`, "i"),
  /importKey\(\s*["']raw["']\s*,\s*(?:new\s+Uint8Array\(\s*\[|["'`])/,
  /enc\.(?:Utf8|Hex|Base64)\.parse\(\s*["'`]/,
];
const ALLOW = "crypto-guard: allow";

export function scan(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (!line.includes(ALLOW) && PATTERNS.some((p) => p.test(line))) hits.push(i + 1);
  });
  return hits;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (name === "__fixtures__" || name === "node_modules") return [];
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const offences = walk(src).flatMap((f) => scan(readFileSync(f, "utf8")).map((l) => `${path.relative(src, f)}:${l}`));
  if (offences.length) {
    console.error("Hard-coded crypto key/IV in frontend/src (PF-16):\n" + offences.join("\n"));
    process.exit(1);
  }
  console.log("crypto-guard: no hard-coded keys or IVs in src/");
}
