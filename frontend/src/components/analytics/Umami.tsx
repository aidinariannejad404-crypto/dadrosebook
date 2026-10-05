"use client";

import Script from "next/script";
import { flushAnalyticsQueue } from "@/lib/analytics";

/** Host of NEXT_PUBLIC_SITE_URL, so Umami ignores pageviews from previews/localhost copies. */
function siteHost(): string | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "").host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Self-hosted Umami (docs/phase-5-contract.md §3). Renders nothing unless both
 * NEXT_PUBLIC_UMAMI_SRC and NEXT_PUBLIC_UMAMI_WEBSITE_ID are set. Queued `track()` events are
 * flushed as soon as the script has loaded.
 */
export function Umami() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;
  const domains = siteHost();
  return (
    <Script
      id="umami"
      src={src}
      strategy="afterInteractive"
      data-website-id={websiteId}
      {...(domains ? { "data-domains": domains } : {})}
      onLoad={flushAnalyticsQueue}
      onReady={flushAnalyticsQueue}
    />
  );
}
