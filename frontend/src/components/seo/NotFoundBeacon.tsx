"use client";

import { useEffect, useRef } from "react";

/**
 * Reports a 404 once to `POST /seo/not-found/` (docs/phase-5-contract.md §2) so the store team can turn
 * missed old Sazito URLs into redirects. Fire-and-forget: navigator.sendBeacon, else fetch keepalive.
 */
export function NotFoundBeacon() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/+$/, "");
      const url = `${base}/seo/not-found/`;
      const body = JSON.stringify({ path: window.location.pathname, referer: document.referrer.slice(0, 500) });
      let queued = false;
      try {
        queued = navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" })) ?? false;
      } catch {
        queued = false;
      }
      if (!queued) {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          credentials: "omit",
        }).catch(() => undefined);
      }
    } catch {
      // reporting must never break the 404 page
    }
  }, []);
  return null;
}
