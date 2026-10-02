/**
 * Thin analytics wrapper. Phase 1: no vendor (decision pending, see PLAN.md §7).
 * Dispatches a `dadrose:analytics` CustomEvent and pushes to window.dataLayer if present,
 * so any tool chosen later can subscribe without touching call sites.
 */

export type AnalyticsEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "kit_built"
  | "notify_me_requested"
  | "course_cross_sell_click"
  | "study_plan_requested";

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsDetail {
  event: AnalyticsEvent;
  params: AnalyticsParams;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AnalyticsDetail>("dadrose:analytics", { detail: { event, params } }),
    );
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...params });
    }
  } catch {
    // analytics must never break the UI
  }
}
