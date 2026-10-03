/**
 * TypeScript copy of `apps.seo.keys.redirect_key` (docs/phase-5-contract.md §1).
 * Both copies must agree: the backend stores `old_path_key`, the middleware looks it up.
 *
 * 1. drop query string and fragment;
 * 2. URL-decode repeatedly until stable (max 3 rounds);
 * 3. ي/ى→ی، ك→ک, then spaces and ZWNJ → "-";
 * 4. lowercase ASCII, collapse repeated "/", strip the trailing "/" (root stays "/").
 */

const ZWNJ = "‌";

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed escape: decode the valid UTF-8 runs only, leave the rest untouched.
    return value.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    });
  }
}

export function redirectKey(path: string): string {
  let key = path.split("#", 1)[0]!.split("?", 1)[0]!;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(key);
    if (next === key) break;
    key = next;
  }
  key = key
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(new RegExp(`[ ${ZWNJ}]`, "g"), "-")
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/\/{2,}/g, "/");
  if (key.length > 1) key = key.replace(/\/+$/, "");
  return key || "/";
}
