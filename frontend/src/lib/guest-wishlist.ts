/**
 * Guest wishlist (ج۶): hearts of a visitor who has not logged in live in localStorage (book ids,
 * newest first) and are merged into the account on login (POST /wishlist/merge/), like the cart.
 */

export const GUEST_WISHLIST_KEY = "dadrose_guest_wishlist";
export const GUEST_WISHLIST_MAX = 100;
/** fired on window when the guest list changes in this tab (other tabs get the storage event) */
export const GUEST_WISHLIST_EVENT = "dadrose:guest-wishlist";

export function parseGuestIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: number[] = [];
    for (const v of data) {
      if (typeof v === "number" && Number.isInteger(v) && v > 0 && !out.includes(v)) out.push(v);
      if (out.length >= GUEST_WISHLIST_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Add (to the front) or remove `id`. */
export function toggleGuestId(list: number[], id: number, on: boolean): number[] {
  const rest = list.filter((x) => x !== id);
  return on ? [id, ...rest].slice(0, GUEST_WISHLIST_MAX) : rest;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestIds(store: StorageLike | null = storage()): number[] {
  try {
    return parseGuestIds(store?.getItem(GUEST_WISHLIST_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeGuestIds(ids: number[], store: StorageLike | null = storage()): void {
  try {
    if (ids.length) store?.setItem(GUEST_WISHLIST_KEY, JSON.stringify(ids));
    else store?.removeItem(GUEST_WISHLIST_KEY);
  } catch {
    // storage blocked: the heart still flips for this page view
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GUEST_WISHLIST_EVENT));
}

export function setGuestHeart(id: number, on: boolean, store: StorageLike | null = storage()): number[] {
  const next = toggleGuestId(readGuestIds(store), id, on);
  writeGuestIds(next, store);
  return next;
}

/**
 * After login: move the browser's hearts into the account (POST /wishlist/merge/) and clear them.
 * `post` is the authenticated fetch (lib/session apiFetch); never throws.
 */
export async function mergeGuestWishlist(
  post: (ids: number[]) => Promise<{ ok: boolean }>,
  store: StorageLike | null = storage(),
): Promise<boolean> {
  const ids = readGuestIds(store);
  if (ids.length === 0) return false;
  try {
    const r = await post(ids);
    if (r.ok) writeGuestIds([], store);
    return r.ok;
  } catch {
    return false;
  }
}
