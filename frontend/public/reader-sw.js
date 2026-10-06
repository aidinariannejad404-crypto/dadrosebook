/*
 * Dadrose reader app-shell worker (Phase 6b offline reading). Registered from /read/* with scope "/".
 *
 * It handles only:
 *  - navigations to /read/*        → network first; offline, the cached shell of that URL (cached
 *                                     when the reader saves a book offline, refreshed on later visits);
 *  - GET /_next/static/* and fonts → cache first (immutable, content-hashed URLs).
 * Everything else — including every /api/* call — goes to the network untouched. The book itself is
 * never here: it lives encrypted in IndexedDB, and the shell pages hold no personal data.
 */
const SHELL_CACHE = "dadrose-reader-shell-v1";
const STATIC_CACHE = "dadrose-reader-static-v1";
const KEEP = [SHELL_CACHE, STATIC_CACHE];
const MAX_STATIC = 400;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("dadrose-reader-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isReadPage(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/read/");
}

function isStatic(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  // dev only (NEXT_PUBLIC_READER_SW=1): never pin hot-update files
  if (url.pathname.includes("/webpack/") || url.pathname.includes("hot-update")) return false;
  return url.pathname.startsWith("/_next/static/") || /\.(woff2?|ttf|otf)$/i.test(url.pathname);
}

/** Cache key of a reader page: path only (no query, no fragment). */
function pageKey(url) {
  return new URL(url.pathname, self.location.origin).toString();
}

async function trimStatic() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i]);
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(SHELL_CACHE);
  const key = pageKey(url);
  try {
    const response = await fetch(request);
    // refresh only shells that were saved for offline reading (keeps them in step with deployments)
    if (response.ok && response.type === "basic" && (await cache.match(key))) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    void trimStatic();
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    if (isReadPage(url)) event.respondWith(networkFirstPage(request, url));
    return;
  }
  if (isStatic(url)) event.respondWith(cacheFirst(request));
});

async function precache(page, assets) {
  const tasks = [];
  if (typeof page === "string" && page.startsWith("/read/")) {
    const url = new URL(page, self.location.origin);
    tasks.push(
      (async () => {
        const response = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
        if (response.ok) await (await caches.open(SHELL_CACHE)).put(pageKey(url), response);
      })(),
    );
  }
  const statics = await caches.open(STATIC_CACHE);
  for (const a of Array.isArray(assets) ? assets.slice(0, MAX_STATIC) : []) {
    let url;
    try {
      url = new URL(a, self.location.origin);
    } catch {
      continue;
    }
    if (!isStatic(url)) continue;
    tasks.push(
      (async () => {
        if (await statics.match(url.toString(), { ignoreVary: true })) return;
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        if (response.ok) await statics.put(url.toString(), response);
      })(),
    );
  }
  await Promise.allSettled(tasks);
}

async function forget(page) {
  if (typeof page !== "string" || !page.startsWith("/read/")) return;
  await (await caches.open(SHELL_CACHE)).delete(pageKey(new URL(page, self.location.origin)));
}

self.addEventListener("message", (event) => {
  // only pages of this origin can message their own worker; validate the shape anyway
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "precache") event.waitUntil(precache(data.page, data.assets));
  else if (data.type === "forget") event.waitUntil(forget(data.page));
});
