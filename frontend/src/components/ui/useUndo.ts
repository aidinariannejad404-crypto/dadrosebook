"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createUndoStore, type UndoEntry, type UndoStore } from "@/lib/undo";

/** One undo store per component instance; timers are cancelled on unmount. */
export function useUndo<T>(onExpire?: (entry: UndoEntry<T>) => void): {
  store: UndoStore<T>;
  entries: readonly UndoEntry<T>[];
} {
  const latest = useRef(onExpire);
  useEffect(() => {
    latest.current = onExpire;
  });
  const [store] = useState(() => createUndoStore<T>({ onExpire: (e) => latest.current?.(e) }));
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => () => store.dispose(), [store]);
  return { store, entries };
}
