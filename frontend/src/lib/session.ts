/**
 * Browser-side calls to the authenticated API (Phase 3).
 *
 * Always same-origin (`/api/v1/…`, proxied to Django by the rewrite in next.config.ts) so the
 * httpOnly auth cookies are first-party. On 401 the access token is refreshed once and the call
 * retried; if the refresh fails the caller gets the 401 (treat as logged out).
 */

export const BROWSER_API = "/api/v1";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiErrorBody };

/** DRF error body: `{ detail }` and/or `{ field: [messages] }`. */
export type ApiErrorBody = Record<string, unknown> & { detail?: string };

export const NETWORK_ERROR = "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.";

let refreshing: Promise<boolean> | null = null;

/** POST /auth/refresh/ once at a time; resolves true when new cookies were set. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BROWSER_API}/auth/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${BROWSER_API}${path}`, { ...init, headers, credentials: "include", cache: "no-store" });
}

/**
 * `apiFetch("/orders/")`, `apiFetch("/addresses/", { method: "POST", json: {...} })`.
 * Never throws: network failures come back as `{ ok: false, status: 0, error: { detail: NETWORK_ERROR } }`.
 */
export async function apiFetch<T>(
  path: string,
  { json, retry = true, ...init }: RequestInit & { json?: unknown; retry?: boolean } = {},
): Promise<ApiResult<T>> {
  const req: RequestInit = json === undefined ? init : { ...init, body: JSON.stringify(json) };
  let res: Response;
  try {
    res = await send(path, req);
    if (res.status === 401 && retry && !path.startsWith("/auth/")) {
      if (await refreshSession()) res = await send(path, req);
    }
  } catch {
    return { ok: false, status: 0, error: { detail: NETWORK_ERROR } };
  }
  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return { ok: false, status: res.status, error: (body && typeof body === "object" ? body : {}) as ApiErrorBody };
}

/** First human message from a DRF error body for `field` (or `detail`, or a fallback). */
export function errorMessage(error: ApiErrorBody, field?: string, fallback = "خطایی رخ داد. دوباره تلاش کنید."): string {
  const pick = (v: unknown): string | null =>
    typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
  if (field) {
    const m = pick(error[field]);
    if (m) return m;
  }
  return pick(error.detail) ?? fallback;
}

/** Field → first message, for forms. */
export function fieldErrors(error: ApiErrorBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(error)) {
    const m = typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
    if (m) out[k] = m;
  }
  return out;
}
