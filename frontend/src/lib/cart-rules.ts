import type { Cart, CartBook, CartErrorCode, CartIssue, CartItem, Variant } from "./types";

/**
 * Pure cart rule engine mirroring `apps.cart.services` (docs/api-contract-phase-2.md › Business
 * rules). Used by the browser cart client in fixture mode (USE_API_FIXTURES=1) so the UI behaves
 * like the real API; the backend stays the source of truth.
 */

export const CART_MAX_QUANTITY = 10;

export interface CatalogEntry {
  variant: Variant;
  book: CartBook;
  /** variant and book are active */
  active: boolean;
}

export type Catalog = (variantId: number) => CatalogEntry | undefined;

export interface CartLine {
  id: number;
  variant_id: number;
  quantity: number;
}

export interface CartState {
  token: string;
  items: CartLine[];
  next_id: number;
  updated_at: string | null;
}

export type RuleResult = { ok: true; state: CartState } | { ok: false; code: CartErrorCode; detail: string };

export const CART_ERROR_DETAIL: Record<CartErrorCode, string> = {
  out_of_stock: "این نسخه در حال حاضر موجود نیست.",
  insufficient_stock: "موجودی این نسخه کمتر از تعداد درخواستی است.",
  price_unavailable: "قیمت این نسخه هنوز اعلام نشده است.",
  unavailable: "این کالا در حال حاضر عرضه نمی‌شود.",
  already_in_bundle: "نسخه الکترونیک این کتاب در بسته «چاپی + الکترونیک» سبد شما هست.",
  invalid_quantity: "تعداد انتخاب‌شده معتبر نیست.",
  not_found: "این کالا پیدا نشد.",
};

export function emptyState(token: string): CartState {
  return { token, items: [], next_id: 1, updated_at: null };
}

function fail(code: CartErrorCode): RuleResult {
  return { ok: false, code, detail: CART_ERROR_DETAIL[code] };
}

/** EBOOK: 1 · PRINT/BUNDLE: min(stock, 10) · 0 when the variant can't be sold right now. */
export function maxQuantity(entry: CatalogEntry): number {
  const v = entry.variant;
  if (!entry.active || v.price_is_placeholder || !v.in_stock) return 0;
  if (v.type === "EBOOK") return 1;
  return Math.max(0, Math.min(v.stock ?? CART_MAX_QUANTITY, CART_MAX_QUANTITY));
}

export function lineIssue(entry: CatalogEntry, quantity: number): CartIssue | null {
  if (!entry.active) return "unavailable";
  if (entry.variant.price_is_placeholder) return "price_unavailable";
  if (!entry.variant.in_stock) return "out_of_stock";
  if (quantity > maxQuantity(entry)) return "insufficient_stock";
  return null;
}

/** Why a variant can't be added at all (null = it can). */
function addBlocker(entry: CatalogEntry): CartErrorCode | null {
  if (!entry.active) return "unavailable";
  if (entry.variant.price_is_placeholder) return "price_unavailable";
  if (!entry.variant.in_stock) return "out_of_stock";
  return null;
}

function touch(state: CartState, items: CartLine[], now: string, next_id = state.next_id): CartState {
  return { ...state, items, next_id, updated_at: now };
}

/** POST /cart/items/ — increments an existing line (clamped), BUNDLE replaces the same book's EBOOK. */
export function addItem(state: CartState, catalog: Catalog, variantId: number, quantity = 1, now = new Date().toISOString()): RuleResult {
  if (!Number.isInteger(quantity) || quantity < 1) return fail("invalid_quantity");
  const entry = catalog(variantId);
  if (!entry) return fail("not_found");
  const blocker = addBlocker(entry);
  if (blocker) return fail(blocker);

  const bookId = entry.book.id;
  const sameBook = (type: Variant["type"]) =>
    state.items.find((l) => {
      const e = catalog(l.variant_id);
      return e != null && e.book.id === bookId && e.variant.type === type;
    });

  let items = state.items;
  if (entry.variant.type === "EBOOK" && sameBook("BUNDLE")) return fail("already_in_bundle");
  if (entry.variant.type === "BUNDLE") {
    const ebook = sameBook("EBOOK");
    if (ebook) items = items.filter((l) => l.id !== ebook.id);
  }

  const max = maxQuantity(entry);
  const existing = items.find((l) => l.variant_id === variantId);
  if (existing) {
    const next = items.map((l) => (l.id === existing.id ? { ...l, quantity: Math.min(l.quantity + quantity, max) } : l));
    return { ok: true, state: touch(state, next, now) };
  }
  const line: CartLine = { id: state.next_id, variant_id: variantId, quantity: Math.min(quantity, max) };
  return { ok: true, state: touch(state, [...items, line], now, state.next_id + 1) };
}

/** PATCH /cart/items/<id>/ — 0 removes the line; above max_quantity is an error. */
export function updateItem(state: CartState, catalog: Catalog, itemId: number, quantity: number, now = new Date().toISOString()): RuleResult {
  const line = state.items.find((l) => l.id === itemId);
  if (!line) return fail("not_found");
  if (!Number.isInteger(quantity) || quantity < 0) return fail("invalid_quantity");
  if (quantity === 0) return removeItem(state, itemId, now);
  const entry = catalog(line.variant_id);
  if (!entry) return fail("not_found");
  if (entry.variant.type === "EBOOK" && quantity > 1) return fail("invalid_quantity");
  const blocker = addBlocker(entry);
  if (blocker) return fail(blocker);
  if (quantity > maxQuantity(entry)) return fail("insufficient_stock");
  return { ok: true, state: touch(state, state.items.map((l) => (l.id === itemId ? { ...l, quantity } : l)), now) };
}

/** DELETE /cart/items/<id>/ */
export function removeItem(state: CartState, itemId: number, now = new Date().toISOString()): RuleResult {
  if (!state.items.some((l) => l.id === itemId)) return fail("not_found");
  return { ok: true, state: touch(state, state.items.filter((l) => l.id !== itemId), now) };
}

/** POST /cart/items/bulk/ — never fails as a whole; per-item errors are skipped. */
export function bulkAdd(
  state: CartState,
  catalog: Catalog,
  items: { variant_id: number; quantity?: number }[],
  now = new Date().toISOString(),
): { state: CartState; added: number[]; skipped: { variant_id: number; code: CartErrorCode; detail: string }[] } {
  let current = state;
  const added: number[] = [];
  const skipped: { variant_id: number; code: CartErrorCode; detail: string }[] = [];
  for (const item of items.slice(0, 50)) {
    const r = addItem(current, catalog, item.variant_id, item.quantity ?? 1, now);
    if (r.ok) {
      current = r.state;
      added.push(item.variant_id);
    } else {
      skipped.push({ variant_id: item.variant_id, code: r.code, detail: r.detail });
    }
  }
  return { state: current, added, skipped };
}

/** Serialise to the API `Cart` shape (reads never mutate: issues are flagged, not fixed). */
export function toCart(state: CartState | null, catalog: Catalog, freeShippingThreshold: number | null): Cart {
  const items: CartItem[] = [];
  for (const line of state?.items ?? []) {
    const entry = catalog(line.variant_id);
    if (!entry) continue;
    const v = entry.variant;
    const issue = lineIssue(entry, line.quantity);
    items.push({
      id: line.id,
      variant: v,
      book: entry.book,
      quantity: line.quantity,
      max_quantity: maxQuantity(entry),
      unit_price: v.effective_price,
      line_total: v.effective_price * line.quantity,
      line_saving: (v.price - v.effective_price) * line.quantity,
      is_available: issue == null,
      issue,
    });
  }
  const available = items.filter((i) => i.is_available);
  const subtotal = available.reduce((s, i) => s + i.line_total, 0);
  const original = available.reduce((s, i) => s + i.variant.price * i.quantity, 0);
  const hasPhysical = available.some((i) => i.variant.type !== "EBOOK");
  const remaining = freeShippingThreshold != null && hasPhysical ? freeShippingThreshold - subtotal : null;
  return {
    token: state?.token ?? null,
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    original_subtotal: original,
    savings: original - subtotal,
    has_physical: hasPhysical,
    has_issues: items.some((i) => !i.is_available),
    free_shipping_threshold: freeShippingThreshold,
    free_shipping_remaining: remaining != null && remaining > 0 ? remaining : null,
    updated_at: state?.updated_at ?? null,
  };
}
