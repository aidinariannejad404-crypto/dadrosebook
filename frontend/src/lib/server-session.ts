import { cookies } from "next/headers";
import { apiBase } from "./api";
import type { Me } from "./account-types";

/**
 * Server-side (RSC) calls on behalf of the visitor: forwards their auth cookies to the internal API.
 * Personal data: never cached. Returns null on 401/404 so pages can redirect to /login or notFound().
 */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** True when the visitor holds an access or refresh cookie (cheap check, no API call). */
export async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return jar.has("dr_access") || jar.has("dr_refresh");
}

/** The logged-in user, or null (also null when only an expired access token is present). */
export async function getMe(): Promise<Me | null> {
  if (!(await hasSessionCookie())) return null;
  try {
    return await serverApiGet<Me>("/me/");
  } catch {
    return null;
  }
}
