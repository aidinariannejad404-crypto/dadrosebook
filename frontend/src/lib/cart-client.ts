import type {
  BackInStockRequestBody,
  BackInStockResponse,
  BookDetail,
  BulkAddResult,
  Cart,
  CartError,
  CartErrorCode,
  CartSource,
  HomePayload,
} from "./types";
import { apiBase } from "./api";
import * as rules from "./cart-rules";

/**
 * Browser cart client (docs/api-contract-phase-2.md › Cart identity, Endpoints, Back-in-stock).
 * The guest cart token lives in localStorage and in a first-party cookie (`dadrose_cart_token`)
 * and travels as `X-Cart-Token`. In fixture mode (USE_API_FIXTURES on the server, passed down by
 * <CartProvider fixtures>) the cart is kept locally and follows the same rules (lib/cart-rules).
 */

export const CART_TOKEN_KEY = "dadrose_cart_token";
const FIXTURE_STATE_KEY = "dadrose_cart_fixture";
const TOKEN_MAX_AGE = 60 * 24 * 60 * 60;

export const NETWORK_ERROR = "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.";
export const GENERIC_ERROR = "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
const THROTTLED = "تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره تلاش کنید.";

export type CartResult = { ok: true; cart: Cart } | { ok: false; error: CartError };
export type BulkResult = { ok: true; result: BulkAddResult } | { ok: false; error: CartError };
export type BackInStockResult =
  | { ok: true; data: BackInStockResponse }
  | { ok: false; code: "phone" | "in_stock" | "unavailable" | "not_found" | "network"; detail: string };

let fixtureMode = false;

/** Set once by <CartProvider> from the server's USE_API_FIXTURES. */
export function configureCartClient({ fixtures }: { fixtures: boolean }): void {
  fixtureMode = fixtures;
}

export function isFixtureMode(): boolean {
  return fixtureMode;
}

/* ---------- token ---------- */

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim()) || null;
  }
  return null;
}

export function getCartToken(): string | null {
  try {
    const stored = window.localStorage.getItem(CART_TOKEN_KEY);
    if (stored) return stored;
  } catch {
    // storage blocked: fall back to the cookie
  }
  return readCookie(CART_TOKEN_KEY);
}

export function setCartToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(CART_TOKEN_KEY, token);
    else window.localStorage.removeItem(CART_TOKEN_KEY);
  } catch {
    // the cookie still carries it
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = token
    ? `${CART_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${TOKEN_MAX_AGE}; SameSite=Lax${secure}`
    : `${CART_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function remember(cart: Cart | null | undefined): void {
  if (cart?.token && cart.token !== getCartToken()) setCartToken(cart.token);
}

export function emptyCart(): Cart {
  return {
    token: null,
    items: [],
    item_count: 0,
    subtotal: 0,
    original_subtotal: 0,
    savings: 0,
    has_physical: false,
    has_issues: false,
    free_shipping_threshold: null,
    free_shipping_remaining: null,
    updated_at: null,
  };
}

/* ---------- HTTP ---------- */

const CART_CODES: CartErrorCode[] = [
  "out_of_stock",
  "insufficient_stock",
  "price_unavailable",
  "unavailable",
  "already_in_bundle",
  "invalid_quantity",
  "not_found",
];

function asCartError(json: unknown): CartError | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Partial<CartError>;
  if (typeof j.code !== "string" || !CART_CODES.includes(j.code as CartErrorCode)) return null;
  return { code: j.code, detail: typeof j.detail === "string" && j.detail ? j.detail : rules.CART_ERROR_DETAIL[j.code as CartErrorCode], cart: j.cart ?? null };
}

const networkError = (detail = NETWORK_ERROR): CartError => ({ code: "network", detail, cart: null });

async function request(method: string, path: string, body?: unknown): Promise<{ res: Response; json: unknown } | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getCartToken();
  if (token) headers["X-Cart-Token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    return { res, json };
  } catch {
    return null;
  }
}

async function cartCall(method: string, path: string, body?: unknown): Promise<CartResult> {
  const r = await request(method, path, body);
  if (!r) return { ok: false, error: networkError() };
  if (r.res.ok && r.json && typeof r.json === "object" && "items" in r.json) {
    const cart = r.json as Cart;
    remember(cart);
    return { ok: true, cart };
  }
  const error = asCartError(r.json);
  if (error) {
    remember(error.cart);
    return { ok: false, error };
  }
  return { ok: false, error: networkError(r.res.status === 429 ? THROTTLED : GENERIC_ERROR) };
}

/* ---------- fixture mode ---------- */

interface FixtureData {
  catalog: rules.Catalog;
  threshold: number | null;
}

let fixtureData: Promise<FixtureData> | null = null;

function loadFixtures(): Promise<FixtureData> {
  fixtureData ??= (async () => {
    const books = (await import("./__fixtures__/books.json")).default as unknown as BookDetail[];
    const home = (await import("./__fixtures__/home.json")).default as unknown as HomePayload;
    const map = new Map<number, rules.CatalogEntry>();
    for (const b of books) {
      const book = { id: b.id, title: b.title, slug: b.slug, cover: b.cover, subjects: b.subjects, authors: b.authors };
      for (const v of b.variants) map.set(v.id, { variant: v, book, active: true });
    }
    return { catalog: (id) => map.get(id), threshold: home.store.free_shipping_threshold };
  })();
  return fixtureData;
}

function newToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readFixtureState(): rules.CartState | null {
  const token = getCartToken();
  if (!token) return null;
  try {
    const raw = window.localStorage.getItem(FIXTURE_STATE_KEY);
    const state = raw ? (JSON.parse(raw) as rules.CartState) : null;
    return state && state.token === token ? state : null;
  } catch {
    return null;
  }
}

function writeFixtureState(state: rules.CartState): void {
  try {
    window.localStorage.setItem(FIXTURE_STATE_KEY, JSON.stringify(state));
  } catch {
    // in-memory only for this call
  }
  setCartToken(state.token);
}

async function fixtureMutate(mutate: (s: rules.CartState, c: rules.Catalog) => rules.RuleResult): Promise<CartResult> {
  const { catalog, threshold } = await loadFixtures();
  const state = readFixtureState() ?? rules.emptyState(getCartToken() ?? newToken());
  const r = mutate(state, catalog);
  if (!r.ok) return { ok: false, error: { code: r.code, detail: r.detail, cart: rules.toCart(readFixtureState(), catalog, threshold) } };
  writeFixtureState(r.state);
  return { ok: true, cart: rules.toCart(r.state, catalog, threshold) };
}

/* ---------- public API ---------- */

/** GET /cart/ — no request (and no cart row) when the browser has no token yet. */
export async function fetchCart(): Promise<CartResult> {
  if (fixtureMode) {
    const { catalog, threshold } = await loadFixtures();
    return { ok: true, cart: rules.toCart(readFixtureState(), catalog, threshold) };
  }
  if (!getCartToken()) return { ok: true, cart: emptyCart() };
  return cartCall("GET", "/cart/");
}

/** POST /cart/items/ (`source` is informational; the single-item endpoint ignores it). */
export async function addToCart(variantId: number, quantity = 1, source: CartSource = "other"): Promise<CartResult> {
  void source;
  if (fixtureMode) return fixtureMutate((s, c) => rules.addItem(s, c, variantId, quantity));
  return cartCall("POST", "/cart/items/", { variant_id: variantId, quantity });
}

/** PATCH /cart/items/<id>/ — 0 removes the line. */
export async function updateQuantity(itemId: number, quantity: number): Promise<CartResult> {
  if (fixtureMode) return fixtureMutate((s, c) => rules.updateItem(s, c, itemId, quantity));
  return cartCall("PATCH", `/cart/items/${itemId}/`, { quantity });
}

/** DELETE /cart/items/<id>/ */
export async function removeItem(itemId: number): Promise<CartResult> {
  if (fixtureMode) return fixtureMutate((s) => rules.removeItem(s, itemId));
  return cartCall("DELETE", `/cart/items/${itemId}/`);
}

/** POST /cart/items/bulk/ — never fails as a whole for per-item errors. */
export async function bulkAdd(items: { variant_id: number; quantity?: number }[], source: CartSource = "other"): Promise<BulkResult> {
  if (fixtureMode) {
    const { catalog, threshold } = await loadFixtures();
    const state = readFixtureState() ?? rules.emptyState(getCartToken() ?? newToken());
    const r = rules.bulkAdd(state, catalog, items);
    writeFixtureState(r.state);
    return { ok: true, result: { cart: rules.toCart(r.state, catalog, threshold), added: r.added, skipped: r.skipped } };
  }
  const r = await request("POST", "/cart/items/bulk/", { items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity ?? 1 })), source });
  if (!r) return { ok: false, error: networkError() };
  if (r.res.ok && r.json && typeof r.json === "object" && "cart" in r.json) {
    const result = r.json as BulkAddResult;
    remember(result.cart);
    return { ok: true, result };
  }
  return { ok: false, error: asCartError(r.json) ?? networkError(r.res.status === 429 ? THROTTLED : GENERIC_ERROR) };
}

/** DELETE /cart/ — emptied, token kept. */
export async function clearCart(): Promise<CartResult> {
  if (fixtureMode) {
    const token = getCartToken();
    const { catalog, threshold } = await loadFixtures();
    if (!token) return { ok: true, cart: emptyCart() };
    const state = { ...rules.emptyState(token), updated_at: new Date().toISOString() };
    writeFixtureState(state);
    return { ok: true, cart: rules.toCart(state, catalog, threshold) };
  }
  if (!getCartToken()) return { ok: true, cart: emptyCart() };
  return cartCall("DELETE", "/cart/");
}

/** POST /back-in-stock/ («موجود شد خبرم کن»). */
export async function requestBackInStock(body: BackInStockRequestBody): Promise<BackInStockResult> {
  if (fixtureMode) {
    return {
      ok: true,
      data: { id: Date.now() % 100000, status: "PENDING", created: true, message: "درخواست شما ثبت شد؛ به محض موجود شدن، پیامک می‌فرستیم." },
    };
  }
  const r = await request("POST", "/back-in-stock/", body);
  if (!r) return { ok: false, code: "network", detail: NETWORK_ERROR };
  const json = (r.json ?? {}) as Record<string, unknown>;
  if (r.res.ok && typeof json.message === "string") return { ok: true, data: json as unknown as BackInStockResponse };
  if (r.res.status === 400 && Array.isArray(json.phone)) {
    return { ok: false, code: "phone", detail: String(json.phone[0] ?? "") || "شماره موبایل معتبر نیست." };
  }
  if (r.res.status === 400 && (json.code === "in_stock" || json.code === "unavailable")) {
    return { ok: false, code: json.code, detail: typeof json.detail === "string" ? json.detail : GENERIC_ERROR };
  }
  if (r.res.status === 404) return { ok: false, code: "not_found", detail: "این نسخه پیدا نشد." };
  return { ok: false, code: "network", detail: r.res.status === 429 ? THROTTLED : GENERIC_ERROR };
}
