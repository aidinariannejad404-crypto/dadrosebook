/**
 * Which items go to checkout. Phase 3 needs an explicit list (the server re-prices it):
 *   1. URL params — «خرید سریع» links: `/checkout?variant=10&qty=2&variant=11` (`qty` pairs with
 *      `variant` by position, default 1);
 *   2. else the Phase 2 cart (GET /api/v1/cart/, docs/api-contract-phase-2.md): guest carts send
 *      `X-Cart-Token` from localStorage `dadrose_cart_token`; lines map `items[].variant.id` + `quantity`
 *      and lines with `is_available: false` are skipped. `{ items: [{ variant_id, quantity }] }` is
 *      accepted too; anything else (or an error) means "no cart".
 * Everything cart-specific lives in this file so it can be adapted when Phase 2 lands.
 */
import type { CheckoutItem } from "./account-types";
import { apiFetch } from "./session";

export const MAX_LINES = 30;
export const MAX_QTY = 20;

export type CheckoutItemsSource = "url" | "cart" | "none";

export interface ResolvedItems {
  items: CheckoutItem[];
  source: CheckoutItemsSource;
}

function toPositiveInt(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Merge duplicate variants (quantities add up), clamp quantities to 1..20 and keep ≤ 30 lines. */
export function normalizeItems(items: CheckoutItem[]): CheckoutItem[] {
  const byId = new Map<number, number>();
  for (const { variant_id, quantity } of items) {
    if (!byId.has(variant_id) && byId.size >= MAX_LINES) continue;
    byId.set(variant_id, Math.min(MAX_QTY, (byId.get(variant_id) ?? 0) + quantity));
  }
  return [...byId].map(([variant_id, quantity]) => ({ variant_id, quantity: Math.max(1, quantity) }));
}

/** Items from `?variant=<id>&qty=<n>` (repeatable). Invalid ids are skipped; bad qty → 1. */
export function parseItemsFromSearch(search: URLSearchParams | string): CheckoutItem[] {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const variants = params.getAll("variant");
  const qtys = params.getAll("qty");
  const items: CheckoutItem[] = [];
  variants.forEach((raw, i) => {
    const id = toPositiveInt(raw);
    if (id == null) return;
    items.push({ variant_id: id, quantity: toPositiveInt(qtys[i]) ?? 1 });
  });
  return normalizeItems(items);
}

/** Items from a cart response body, or null when the shape is not recognised. */
export function parseCartResponse(body: unknown): CheckoutItem[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;
  const items: CheckoutItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { variant?: unknown; variant_id?: unknown; quantity?: unknown; is_available?: unknown };
    if (e.is_available === false) continue;
    const nested = e.variant && typeof e.variant === "object" ? (e.variant as { id?: unknown }).id : undefined;
    const id = toPositiveInt(e.variant_id ?? nested ?? (typeof e.variant === "number" ? e.variant : undefined));
    if (id == null) continue;
    items.push({ variant_id: id, quantity: toPositiveInt(e.quantity) ?? 1 });
  }
  return normalizeItems(items);
}

/** Stable key of an item set (for the per-attempt checkout_key in sessionStorage). */
export function itemsKey(items: CheckoutItem[]): string {
  return [...items]
    .sort((a, b) => a.variant_id - b.variant_id)
    .map((i) => `${i.variant_id}x${i.quantity}`)
    .join(",");
}

/** Pluggable cart source: resolves to the cart's items, or null. Never throws. */
export type CartSource = () => Promise<CheckoutItem[] | null>;

export const CART_TOKEN_KEY = "dadrose_cart_token";

function cartToken(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}

export const phase2CartSource: CartSource = async () => {
  try {
    const token = cartToken();
    const res = await apiFetch<unknown>("/cart/", token ? { headers: { "X-Cart-Token": token } } : {});
    return res.ok && res.status === 200 ? parseCartResponse(res.data) : null;
  } catch {
    return null;
  }
};

/** URL items win; else the cart; else an empty list. */
export async function resolveCheckoutItems(
  search: URLSearchParams | string,
  cartSource: CartSource = phase2CartSource,
): Promise<ResolvedItems> {
  const fromUrl = parseItemsFromSearch(search);
  if (fromUrl.length > 0) return { items: fromUrl, source: "url" };
  const fromCart = await cartSource().catch(() => null);
  if (fromCart && fromCart.length > 0) return { items: fromCart, source: "cart" };
  return { items: [], source: "none" };
}
