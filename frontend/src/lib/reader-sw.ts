import { routes } from "./config";

/**
 * Reader app-shell service worker (public/reader-sw.js), Phase 6b offline reading.
 *
 * Registered from the /read route only, with scope "/" (Next's chunks live under /_next/static/, so
 * a "/read/" scope could not serve them). The worker itself only touches navigations to /read/*,
 * GET /_next/static/* and font files — never /api/*. Skipped in development (HMR) unless
 * NEXT_PUBLIC_READER_SW=1.
 */

export const READER_SW_URL = "/reader-sw.js";

export function readerSwEnabled(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!window.isSecureContext) return false;
  return process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_READER_SW === "1";
}

/** Register (idempotent). Never throws. */
export async function registerReaderSw(): Promise<ServiceWorkerRegistration | null> {
  if (!readerSwEnabled()) return null;
  try {
    return await navigator.serviceWorker.register(READER_SW_URL, { scope: "/" });
  } catch {
    return null;
  }
}

/** Same-origin static assets this page already loaded (chunks, CSS, fonts) — what the shell needs offline. */
export function loadedShellAssets(
  entries: readonly { name: string }[] = typeof performance !== "undefined"
    ? (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    : [],
  origin: string = typeof location !== "undefined" ? location.origin : "",
): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    let u: URL;
    try {
      u = new URL(e.name, origin || undefined);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    if (u.pathname.startsWith("/api/")) continue;
    if (u.pathname.startsWith("/_next/static/") || /\.(woff2?|ttf|otf)$/i.test(u.pathname)) out.add(u.pathname + u.search);
  }
  return [...out];
}

async function post(message: unknown): Promise<boolean> {
  if (!readerSwEnabled()) return false;
  try {
    const reg = (await registerReaderSw()) ?? (await navigator.serviceWorker.getRegistration("/"));
    if (!reg) return false;
    const ready = await navigator.serviceWorker.ready;
    const worker = ready.active ?? reg.active ?? reg.waiting ?? reg.installing;
    if (!worker) return false;
    worker.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** Keep /read/<slug> and the loaded static assets so the reader opens with no network. */
export function precacheReader(slug: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return post({ type: "precache", page: routes.read(slug), assets: loadedShellAssets() });
}

/** Drop the cached shell of /read/<slug> (the offline copy was deleted). */
export function forgetReader(slug: string): Promise<boolean> {
  return post({ type: "forget", page: routes.read(slug) });
}
