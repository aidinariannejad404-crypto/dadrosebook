"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackHubCtaClick, type HubCtaClick } from "@/lib/analytics";

/** Internal link inside a hub page that fires `hub_cta_click` (package ب). */
export function HubCtaLink({ cta, onClick, ...rest }: ComponentProps<typeof Link> & { cta: HubCtaClick }) {
  return (
    <Link
      prefetch={false}
      {...rest}
      onClick={(e) => {
        trackHubCtaClick(cta);
        onClick?.(e);
      }}
    />
  );
}
