import type { Metadata } from "next";
import type { NotificationPreference } from "@/lib/platform-types";
import { serverApiGet } from "@/lib/server-session";
import { NotificationPrefs } from "@/components/platform/NotificationPrefs";
import { OfficialChannelsNote } from "@/components/platform/OfficialChannelsNote";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تنظیم اعلان‌ها", robots: { index: false, follow: false } };

/** PF-3 «اعلان‌ها»: per-kind switches for marketing messages; service messages always on. */
export default async function NotificationsPage() {
  let prefs: NotificationPreference[] | null = null;
  try {
    prefs = await serverApiGet<NotificationPreference[]>("/me/notification-settings/");
  } catch {
    prefs = null;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-ink">تنظیم اعلان‌ها</h1>
      {prefs ? (
        <NotificationPrefs initial={prefs} />
      ) : (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">تنظیمات فعلاً در دسترس نیست.</p>
      )}
      <OfficialChannelsNote />
    </div>
  );
}
