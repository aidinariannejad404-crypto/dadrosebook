import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import fixtureRedirects from "./lib/__fixtures__/redirects.json";
import { parseRedirectPayload, resolveRedirect, shouldCheckRedirect, type RedirectMap } from "./lib/redirects";

/**
 * Old Sazito URLs → 301/302 (docs/phase-5-contract.md §2). The map comes from
 * `${API_INTERNAL_URL}/seo/redirects/`, cached per server instance for 5 minutes and served stale while
 * the API is down. This middleware never throws: any failure means "no redirect".
 */

const TTL_MS = 300_000;
/** after a failed fetch, wait this long before trying again (keeps a down API from being hammered) */
const RETRY_MS = 30_000;
const FETCH_TIMEOUT_MS = 1_500;

interface CacheState {
  map: RedirectMap | null;
  /** next time a refresh is due */
  refreshAt: number;
  inflight: Promise<void> | null;
}

const state: CacheState = { map: null, refreshAt: 0, inflight: null };

function apiBase(): string {
  return (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(
    /\/+$/,
    "",
  );
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function refresh(): Promise<void> {
  if (state.inflight) return state.inflight;
  state.inflight = (async () => {
    try {
      const res = await fetchWithTimeout(`${apiBase()}/seo/redirects/`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`redirects ${res.status}`);
      state.map = parseRedirectPayload(await res.json());
      state.refreshAt = Date.now() + TTL_MS;
    } catch {
      // stale-while-error: keep the previous map (if any) and retry a little later
      state.refreshAt = Date.now() + RETRY_MS;
    } finally {
      state.inflight = null;
    }
  })();
  return state.inflight;
}

async function redirectMap(event: NextFetchEvent): Promise<RedirectMap | null> {
  if (process.env.USE_API_FIXTURES === "1") return parseRedirectPayload(fixtureRedirects);
  if (Date.now() >= state.refreshAt) {
    if (state.map) event.waitUntil(refresh()); // serve the stale map, refresh in the background
    else await refresh();
  }
  return state.map;
}

function sendHitBeacon(path: string, request: NextRequest): Promise<void> {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return fetchWithTimeout(`${apiBase()}/seo/redirects/hit/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
    },
    body: JSON.stringify({ path }),
  }).then(
    () => undefined,
    () => undefined,
  );
}

export async function middleware(request: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
    const { pathname, search } = request.nextUrl;
    if (!shouldCheckRedirect(pathname)) return NextResponse.next();
    const map = await redirectMap(event);
    if (!map) return NextResponse.next();
    const decision = resolveRedirect(map, pathname, search);
    if (!decision) return NextResponse.next();
    if (process.env.USE_API_FIXTURES !== "1") event.waitUntil(sendHitBeacon(pathname, request));
    // Internal targets resolve against the request URL; Next relativises same-origin Locations itself.
    return NextResponse.redirect(new URL(decision.location, request.nextUrl), decision.status);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  // Everything except framework/asset prefixes; file extensions are filtered in shouldCheckRedirect.
  matcher: ["/((?!_next/|api/|static/|media/).*)"],
};
