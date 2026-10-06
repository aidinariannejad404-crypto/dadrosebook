"use client";

import { useEffect } from "react";
import { trackCampaignViewed } from "@/lib/analytics";

export function CampaignViewTracker({ slug, state }: { slug: string; state: string }) {
  useEffect(() => trackCampaignViewed({ slug, state }), [slug, state]);
  return null;
}
