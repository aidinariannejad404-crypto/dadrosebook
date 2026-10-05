"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** True when `pathname` is one of `exact` or sits under one of `prefixes` ("/read" matches "/read/x"). */
export function matchesPath(pathname: string, { exact = [], prefixes = [] }: { exact?: string[]; prefixes?: string[] }): boolean {
  if (exact.includes(pathname)) return true;
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * Renders `children` except on the given routes, where `fallback` (or nothing) is rendered instead.
 * usePathname() is available during SSR, so the right chrome is in the first HTML (no layout shift).
 */
export function HideOn({
  exact,
  prefixes,
  fallback = null,
  children,
}: {
  exact?: string[];
  prefixes?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  return <>{matchesPath(pathname, { exact, prefixes }) ? fallback : children}</>;
}
