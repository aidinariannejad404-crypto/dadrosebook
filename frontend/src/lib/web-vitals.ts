/**
 * Package الف۷: field Core Web Vitals (RUM). Lab Lighthouse cannot measure INP and CrUX may have too little
 * Iranian traffic for a new origin, so real visitors' LCP / INP / CLS / TTFB go to Umami as a sampled
 * `web_vitals` event tagged with the page type and the connection type. Pure helpers (tested); the
 * reporter is components/analytics/WebVitals.tsx.
 */

export const REPORTED_METRICS = ["LCP", "INP", "CLS", "TTFB"] as const;
export type ReportedMetric = (typeof REPORTED_METRICS)[number];

/** Share of page loads that report (NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE, 0..1; default 0.2). */
export const DEFAULT_SAMPLE_RATE = 0.2;

export function sampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SAMPLE_RATE;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SAMPLE_RATE;
}

/** One decision per page load: `random` in [0, 1). */
export function isSampled(rate: number, random: number): boolean {
  return rate > 0 && random < rate;
}

export type PageType =
  | "home"
  | "product"
  | "category"
  | "search"
  | "kit"
  | "policy"
  | "cart"
  | "checkout"
  | "account"
  | "reader"
  | "plan"
  | "login"
  | "other";

const PREFIXES: [string, PageType][] = [
  ["/product", "product"],
  ["/category", "category"],
  ["/search", "search"],
  ["/kit", "kit"],
  ["/cart", "cart"],
  ["/checkout", "checkout"],
  ["/account", "account"],
  ["/read", "reader"],
  ["/plan", "plan"],
  ["/login", "login"],
  ["/about", "policy"],
  ["/faq", "policy"],
  ["/returns", "policy"],
  ["/shipping", "policy"],
];

/** Route family of a pathname (never the slug itself: keeps Umami's event data low-cardinality). */
export function pageType(pathname: string): PageType {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  for (const [prefix, type] of PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return type;
  }
  return "other";
}

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}

/** "4g" | "3g" | "2g" | "slow-2g" (+ "-save" with Data Saver), else "unknown" (Safari/Firefox). */
export function connectionType(nav: { connection?: NetworkInformationLike } | undefined | null): string {
  const c = nav?.connection;
  const type = typeof c?.effectiveType === "string" && /^[a-z0-9-]{1,10}$/.test(c.effectiveType) ? c.effectiveType : "unknown";
  return c?.saveData ? `${type}-save` : type;
}

export interface VitalMetric {
  name: string;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  navigationType?: string;
}

export interface VitalPayload {
  metric: ReportedMetric;
  /** ms for LCP/INP/TTFB (integer); CLS unitless with 3 decimals. Not named `value`: analytics.ts
   *  treats `value` as money and would add currency. */
  metric_value: number;
  rating: string;
  page_type: PageType;
  connection: string;
  navigation_type: string;
}

/** Payload for one metric, or null for metrics we don't report (FCP, FID…) or junk values. */
export function vitalPayload(metric: VitalMetric, pathname: string, connection: string): VitalPayload | null {
  if (!(REPORTED_METRICS as readonly string[]).includes(metric.name)) return null;
  if (!Number.isFinite(metric.value) || metric.value < 0) return null;
  const name = metric.name as ReportedMetric;
  return {
    metric: name,
    metric_value: name === "CLS" ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value),
    rating: metric.rating ?? "unknown",
    page_type: pageType(pathname),
    connection,
    navigation_type: metric.navigationType ?? "unknown",
  };
}
