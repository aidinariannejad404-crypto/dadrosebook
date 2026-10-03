/**
 * Per-attempt idempotency key for POST /checkout/ (same key → same order on the server). Kept in
 * sessionStorage per item set + choices, so a double click or coming back from the gateway reuses it.
 */
const PREFIX = "dr_checkout_key:";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for old browsers: RFC 4122 v4 from getRandomValues.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function checkoutKeyFor(fingerprint: string): string {
  try {
    const stored = sessionStorage.getItem(PREFIX + fingerprint);
    if (stored) return stored;
    const key = newKey();
    sessionStorage.setItem(PREFIX + fingerprint, key);
    return key;
  } catch {
    return newKey();
  }
}

/** After a paid order: the next purchase must start a new order. */
export function clearCheckoutKeys(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // storage unavailable: nothing to clear
  }
}
