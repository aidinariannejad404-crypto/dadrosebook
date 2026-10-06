"use client";

import { useEffect } from "react";
import { trackCompareOpen } from "@/lib/analytics";

/** Fires `compare_open` once per page view. */
export function CompareOpened({ count }: { count: number }) {
  useEffect(() => trackCompareOpen(count), [count]);
  return null;
}
