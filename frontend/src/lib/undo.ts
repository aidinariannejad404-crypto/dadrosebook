/**
 * Undo instead of confirm (ج۴): a removed item lingers as «حذف شد · بازگرداندن» for UNDO_MS.
 * Framework-free store (subscribe/getSnapshot for useSyncExternalStore) so the timer logic is
 * testable with fake timers.
 */

export const UNDO_MS = 6000;

export interface UndoEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
}

export interface UndoStore<T> {
  /** Remember `value` under `key` for `duration` ms (replaces an existing entry with that key). */
  push: (key: string, value: T) => void;
  /** Take the entry back (cancels its timer); null when it already expired. */
  undo: (key: string) => T | null;
  /** Drop an entry now (e.g. its ✕ was pressed); fires onExpire. */
  dismiss: (key: string) => void;
  /** Cancel every timer without firing onExpire (unmount). */
  dispose: () => void;
  getSnapshot: () => readonly UndoEntry<T>[];
  subscribe: (listener: () => void) => () => void;
}

interface Options<T> {
  duration?: number;
  now?: () => number;
  onExpire?: (entry: UndoEntry<T>) => void;
}

export function createUndoStore<T>({ duration = UNDO_MS, now = Date.now, onExpire }: Options<T> = {}): UndoStore<T> {
  let entries: readonly UndoEntry<T>[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function clearTimer(key: string) {
    const t = timers.get(key);
    if (t !== undefined) clearTimeout(t);
    timers.delete(key);
  }

  function take(key: string): UndoEntry<T> | null {
    const entry = entries.find((e) => e.key === key) ?? null;
    if (!entry) return null;
    clearTimer(key);
    entries = entries.filter((e) => e.key !== key);
    emit();
    return entry;
  }

  return {
    push(key, value) {
      clearTimer(key);
      const entry = { key, value, expiresAt: now() + duration };
      entries = [...entries.filter((e) => e.key !== key), entry];
      timers.set(
        key,
        setTimeout(() => {
          const gone = take(key);
          if (gone) onExpire?.(gone);
        }, duration),
      );
      emit();
    },
    undo(key) {
      return take(key)?.value ?? null;
    },
    dismiss(key) {
      const gone = take(key);
      if (gone) onExpire?.(gone);
    },
    dispose() {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    },
    getSnapshot: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
