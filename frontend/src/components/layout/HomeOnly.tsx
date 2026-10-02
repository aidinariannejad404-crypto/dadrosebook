"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Parallel-route slots keep their last content on client-side navigation; this hides the
 * homepage-only top bar as soon as the user navigates away from "/".
 */
export function HomeOnly({ children }: { children: ReactNode }) {
  return usePathname() === "/" ? <>{children}</> : null;
}
