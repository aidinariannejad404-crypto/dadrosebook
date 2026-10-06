import type { Metadata } from "next";
import { selectedExamSlug } from "@/lib/exam-server";
import { serverApiGet } from "@/lib/server-session";
import type { NotifyEntry, Readiness, ReminderConsent } from "@/lib/trust-types";
import { ReadinessDashboard } from "@/components/trust/ReadinessDashboard";
import { NotifyList } from "@/components/trust/NotifyList";
import { ReminderToggle } from "@/components/trust/ReminderToggle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "آمادگی من", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** د۴ readiness dashboard: essential books per subject of «آزمون من», % read, days left, «خبرم کن». */
export default async function ReadinessPage() {
  const exam = await selectedExamSlug();
  const qs = exam ? `?exam=${encodeURIComponent(exam)}` : "";
  const [data, notify, reminders] = await Promise.all([
    safe(serverApiGet<Readiness>(`/me/readiness/${qs}`)),
    safe(serverApiGet<NotifyEntry[]>("/me/back-in-stock/")),
    safe(serverApiGet<ReminderConsent>("/me/study-reminders/")),
  ]);
  return (
    <div className="space-y-8">
      <section aria-labelledby="readiness-title">
        <h1 id="readiness-title" className="mb-4 text-xl font-black text-ink">
          آمادگی من
        </h1>
        {data ? (
          <ReadinessDashboard data={data} />
        ) : (
          <p className="rounded-card bg-surface p-4 text-ink-muted shadow-card">داشبورد آمادگی فعلاً در دسترس نیست.</p>
        )}
      </section>

      <section aria-labelledby="notify-title">
        <h2 id="notify-title" className="mb-3 text-lg font-extrabold text-ink">
          «خبرم کن»‌های من
        </h2>
        {notify ? (
          <NotifyList entries={notify} />
        ) : (
          <p className="rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">فهرست «خبرم کن» فعلاً در دسترس نیست.</p>
        )}
      </section>

      {reminders && (
        <section aria-labelledby="reminders-title">
          <h2 id="reminders-title" className="mb-3 text-lg font-extrabold text-ink">
            یادآور مطالعه
          </h2>
          <ReminderToggle initial={reminders} />
        </section>
      )}
    </div>
  );
}
