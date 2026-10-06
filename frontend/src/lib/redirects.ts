import { redirectKey } from "./redirect-key";

/** `GET /api/v1/seo/redirects/` → `redirects`: { "<old_path_key>": ["<new_path>", 301 | 302] }. */
export type RedirectMap = Record<string, [string, number]>;

export interface RedirectPayload {
  version: string;
  redirects: RedirectMap;
}

export interface RedirectDecision {
  /** relative path (+ query) for internal targets, absolute https URL otherwise */
  location: string;
  status: 301 | 302;
  /** the redirect_key that matched (for the hit beacon) */
  key: string;
}

const SKIP_PREFIXES = ["/_next/", "/api/", "/static/", "/media/"];

/** Paths the middleware looks at: no framework/asset paths, no files except legacy .html/.php pages. */
export function shouldCheckRedirect(pathname: string): boolean {
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p) || pathname === p.slice(0, -1))) return false;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return true;
  const ext = last.slice(dot + 1).toLowerCase();
  // only a short ASCII suffix is a file extension ("کتاب.ویرایش-دوم" is still a page)
  if (!/^[a-z0-9]{1,5}$/.test(ext)) return true;
  return ext === "html" || ext === "php";
}

/** Defensive parse of the API payload: drops malformed rows instead of failing. */
export function parseRedirectPayload(json: unknown): RedirectMap {
  const out: RedirectMap = {};
  if (!json || typeof json !== "object") return out;
  const redirects = (json as { redirects?: unknown }).redirects;
  if (!redirects || typeof redirects !== "object") return out;
  for (const [key, value] of Object.entries(redirects as Record<string, unknown>)) {
    if (!Array.isArray(value) || typeof value[0] !== "string") continue;
    out[key] = [value[0], typeof value[1] === "number" ? value[1] : 301];
  }
  return out;
}

function isInternal(target: string): boolean {
  return target.startsWith("/") && !target.startsWith("//");
}

/** Encode a decoded internal path for a Location header (Persian → %XX; existing escapes kept). */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join("/");
}

/**
 * Decide whether `pathname` (+ `search`, e.g. "?utm_source=x") is an old Sazito URL.
 * Internal targets keep the request's query string (target params win on conflicts);
 * absolute targets must be https and are used as they are. Self-redirects are ignored.
 */
export function resolveRedirect(map: RedirectMap, pathname: string, search = ""): RedirectDecision | null {
  const key = redirectKey(pathname);
  const hit = map[key];
  if (!hit) return null;
  const [target, rawStatus] = hit;
  const status: 301 | 302 = rawStatus === 302 ? 302 : 301;

  if (isInternal(target)) {
    const [targetPath = "/", targetQuery = ""] = target.split("?", 2);
    if (redirectKey(targetPath) === key) return null;
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const own = new URLSearchParams(targetQuery);
    own.forEach((v, k) => params.set(k, v));
    const qs = params.toString();
    return { location: `${encodePath(targetPath)}${qs ? `?${qs}` : ""}`, status, key };
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return { location: url.toString(), status, key };
}
