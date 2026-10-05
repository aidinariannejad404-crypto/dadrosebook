import type { Metadata } from "next";
import { DevicesManager } from "@/components/account/DevicesManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دستگاه‌های من", robots: { index: false, follow: false } };

/** Phase 6b: ebook reading devices. Client-rendered so the browser's X-Reader-Device marks «این دستگاه». */
export default function DevicesPage() {
  return <DevicesManager />;
}
