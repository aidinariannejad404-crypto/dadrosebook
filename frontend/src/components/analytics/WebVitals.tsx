"use client";

import { useReportWebVitals } from "next/web-vitals";
import { trackWebVital } from "@/lib/analytics";
import { connectionType, isSampled, sampleRate, vitalPayload } from "@/lib/web-vitals";

/** Sampling is decided once per page load, so a sampled view reports all of its metrics. */
const SAMPLED =
  typeof window !== "undefined" &&
  isSampled(sampleRate(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE), Math.random());

/**
 * Package الف۷: reports LCP / INP / CLS / TTFB of sampled page loads to Umami (`web_vitals` event,
 * tagged with page type and connection type). Renders nothing; no extra package (Next's built-in hook).
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!SAMPLED) return;
    try {
      const payload = vitalPayload(
        metric,
        window.location.pathname,
        connectionType(navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }),
      );
      if (payload) trackWebVital(payload);
    } catch {
      // measurement must never break the page
    }
  });
  return null;
}
