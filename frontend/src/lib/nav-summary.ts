/**
 * PF-2 / PF-9: the visitor's personal chrome state (bell badge, «کتابخانه» tab, «ادامه مطالعه»,
 * onboarding flag) from `GET /inbox/summary/`. Fetched once per page load in the browser and
 * shared by every subscriber, so cached catalog/home HTML never carries personal data.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Me } from "./account-types";
import type { NavSummary } from "./platform-types";
import { apiFetch } from "./session";
import { toPersianDigits } from "./format";

/** Same name as components/auth/auth-events.ts (kept literal so lib/ doesn't import components/). */
const AUTH_EVENT = "dadrose:auth";

export type NavStatus = "idle" | "loading" | "anonymous" | "ready";
interface NavState {
  status: NavStatus;
  data: NavSummary | null;
}

const SERVER_STATE: NavState = { status: "idle", data: null };
let state: NavState = SERVER_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let authBound = false;

function set(next: NavState) {
  state = next;
  listeners.forEach((l) => l());
}

export function loadNavSummary(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight && !force) return inflight;
  if (!force && (state.status === "ready" || state.status === "anonymous")) return Promise.resolve();
  if (state.status === "idle") set({ status: "loading", data: state.data });
  inflight = apiFetch<NavSummary>("/inbox/summary/")
    .then((res) => {
      set(res.ok ? { status: "ready", data: res.data } : { status: "anonymous", data: null });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Patch the cached summary (e.g. the unread count after «همه خوانده شد»). */
export function patchNavSummary(patch: Partial<NavSummary>): void {
  if (!state.data) return;
  set({ status: state.status, data: { ...state.data, ...patch } });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!authBound && typeof window !== "undefined") {
    authBound = true;
    window.addEventListener(AUTH_EVENT, (e) => {
      const me = (e as CustomEvent<Me | null>).detail;
      if (me) void loadNavSummary(true);
      else set({ status: "anonymous", data: null });
    });
  }
  return () => listeners.delete(listener);
}

/** `{status, data}`; data is null for guests and until the first response. */
export function useNavSummary(): NavState {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  useEffect(() => {
    void loadNavSummary();
  }, []);
  return snap;
}

/** PF-9: logged-in customers who own any ebook get «کتابخانه» in place of «دسته‌ها». */
export function libraryTabEnabled(summary: NavSummary | null | undefined): boolean {
  return !!summary?.has_library;
}

/** Badge text for the bell: "" (none), "۱"…"۹۹", "۹۹+". */
export function unreadBadge(count: number | null | undefined): string {
  if (!count || count < 0) return "";
  return toPersianDigits(count > 99 ? "99+" : count);
}

/** Test hook. */
export function _resetNavSummaryForTests(): void {
  state = SERVER_STATE;
  inflight = null;
  listeners.clear();
}
