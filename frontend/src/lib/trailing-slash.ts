/**
 * Package الف۵: one URL per page. next.config.ts keeps `skipTrailingSlashRedirect` for the /api/v1 proxy
 * (Django URLs end with "/"), so "/product/x/" and "/product/x" would both answer 200. The middleware
 * 301s the slash form of every non-API page to the slash-less one (query string kept).
 */

const SKIP_PREFIXES = ["/api/", "/_next/", "/static/", "/media/"];

/** "/x/?a=1" → "/x?a=1"; null when no redirect is needed ("/", API/framework paths, already clean). */
export function trailingSlashRedirect(pathname: string, search = ""): string | null {
  if (pathname === "/" || !pathname.endsWith("/")) return null;
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/api/") return null;
  // "//" or "///" alone would become "" → the home page
  const target = pathname.replace(/\/+$/, "") || "/";
  // never redirect protocol-relative-looking paths ("//evil.com/") to another host
  const safe = target.startsWith("//") ? `/${target.replace(/^\/+/, "")}` : target;
  return `${safe}${search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : ""}`;
}
