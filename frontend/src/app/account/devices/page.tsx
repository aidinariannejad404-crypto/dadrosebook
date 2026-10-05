import type { Metadata } from "next";
import { DevicesManager } from "@/components/account/DevicesManager";
import { OfflineBooks } from "@/components/account/OfflineBooks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دستگاه‌های من", robots: { index: false, follow: false } };

/**
 * Phase 6b: ebook reading devices and offline books. Client-rendered so the browser's X-Reader-Device
 * marks «این دستگاه» and the local encrypted copies can be matched.
 */
export default function DevicesPage() {
  return (
    <>
      <DevicesManager />
      <OfflineBooks />
    </>
  );
}
