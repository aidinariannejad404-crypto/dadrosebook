"use client";

import { useSyncExternalStore } from "react";
import { COMPARE_EVENT, COMPARE_KEY, parseCompareItems, toggleCompare, type CompareItem } from "@/lib/compare";

let cache: { raw: string | null; items: CompareItem[] } = { raw: null, items: [] };
const EMPTY: CompareItem[] = [];

function read(): CompareItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(COMPARE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, items: parseCompareItems(raw) };
  return cache.items;
}

function write(items: CompareItem[]) {
  try {
    if (items.length) window.localStorage.setItem(COMPARE_KEY, JSON.stringify(items));
    else window.localStorage.removeItem(COMPARE_KEY);
  } catch {
    // storage blocked: the tray only lasts for this page
    cache = { raw: JSON.stringify(items), items };
  }
  window.dispatchEvent(new CustomEvent(COMPARE_EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === COMPARE_KEY) cb();
  };
  window.addEventListener(COMPARE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COMPARE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The compare tray, shared by every toggle and the floating bar. */
export function useCompareTray(): {
  items: CompareItem[];
  toggle: (item: CompareItem, on: boolean) => { full: boolean };
  clear: () => void;
} {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items,
    toggle(item, on) {
      const r = toggleCompare(read(), item, on);
      if (!r.full) write(r.list);
      return { full: r.full };
    },
    clear: () => write([]),
  };
}
