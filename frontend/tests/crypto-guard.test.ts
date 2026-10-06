import { describe, expect, it } from "vitest";
import { scan } from "../scripts/check-crypto-keys.mjs";

describe("PF-16 crypto guard", () => {
  it.each([
    'const AES_KEY = "00112233445566778899aabbccddeeff";',
    "const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);",
    'await crypto.subtle.importKey("raw", new Uint8Array([1,2,3]), "AES-GCM", false, []);',
    'const k = CryptoJS.enc.Utf8.parse("sixteen byte key");',
    "secretKey: 'c2l4dGVlbiBieXRlIGtleSEhIQ==',",
  ])("flags %s", (line) => {
    expect(scan(line)).toEqual([1]);
  });

  it.each([
    "const iv = crypto.getRandomValues(new Uint8Array(12));",
    'const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);',
    'export const READER_THEME_KEY = "dadrose.reader.theme";',
    'const key = "00112233445566778899aabbccddeeff"; // crypto-guard: allow (test vector)',
  ])("ignores %s", (line) => {
    expect(scan(line)).toEqual([]);
  });
});
