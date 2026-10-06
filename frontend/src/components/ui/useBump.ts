"use client";

import { useEffect, useRef, useState } from "react";
import { shouldBump } from "@/lib/kit-complete";

/** Increments when `count` rises (not on the first value): use it as a `key` to replay `.motion-bump`. */
export function useBump(count: number, ready = true): number {
  const prev = useRef<number | null>(null);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!ready) return;
    if (shouldBump(prev.current, count)) setBump((b) => b + 1);
    prev.current = count;
  }, [count, ready]);
  return bump;
}
