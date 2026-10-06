"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * "page" when the current path is `href`; "true" when it is one of `within` (e.g. a sub-category of
 * this top-level category); false otherwise. Paths are compared decoded (Persian slugs).
 */
export function navState(pathname: string, href: string, within: string[] = []): "page" | "true" | false {
  const here = safeDecode(pathname).replace(/\/+$/, "") || "/";
  const target = safeDecode(href).replace(/\/+$/, "") || "/";
  if (here === target) return "page";
  return within.some((w) => safeDecode(w).replace(/\/+$/, "") === here) ? "true" : false;
}

/**
 * Category nav link with scope highlighting: aria-current + gold underline when active
 * (the current category, or the parent of the current sub-category).
 */
export function NavLink({
  href,
  within,
  className = "",
  children,
}: {
  href: string;
  within?: string[];
  className?: string;
  children: ReactNode;
}) {
  const state = navState(usePathname() ?? "/", href, within);
  return (
    <Link
      prefetch={false}
      href={href}
      aria-current={state || undefined}
      data-active={state ? "" : undefined}
      className={`relative inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm hover:bg-primary-soft hover:text-primary after:absolute after:inset-x-3 after:bottom-0.5 after:h-[3px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[active]:font-extrabold data-[active]:text-primary data-[active]:after:opacity-100 ${className}`}
    >
      {children}
    </Link>
  );
}
