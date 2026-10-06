"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/pwa-install";

/**
 * PF-14: `beforeinstallprompt` fires once, early, on any page. Keep it (root layout) so the
 * library / after-purchase install card can show the browser's install dialog later.
 */
export function PwaInstallListener() {
  useEffect(() => {
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);
  return null;
}
