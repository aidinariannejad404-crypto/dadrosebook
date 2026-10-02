"use client";

import type { AnchorHTMLAttributes } from "react";
import { track, type AnalyticsEvent, type AnalyticsParams } from "@/lib/analytics";

interface TrackedLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  event: AnalyticsEvent;
  params?: AnalyticsParams;
  external?: boolean;
}

/** Plain <a> that fires an analytics event on click (used for external course links). */
export function TrackedLink({ event, params, external, onClick, children, ...rest }: TrackedLinkProps) {
  return (
    <a
      {...rest}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      onClick={(e) => {
        track(event, params);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
