import type { Metadata } from "next";
import type { StudyProfilePayload } from "@/lib/platform-types";
import { getExamTypes, getSubjects } from "@/lib/api";
import { serverApiGet } from "@/lib/server-session";
import { StudyProfileEditor } from "@/components/platform/StudyProfileEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "آزمون و درس‌های من", robots: { index: false, follow: false } };

/** PF-8: the study profile (also asked once in a sheet after the first login). */
export default async function StudyProfilePage() {
  const [payload, examTypes, subjects] = await Promise.all([
    serverApiGet<StudyProfilePayload>("/me/study-profile/").catch(() => null),
    getExamTypes().catch(() => []),
    getSubjects().catch(() => []),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-ink">آزمون و درس‌های من</h1>
        <p className="mt-1 text-sm leading-7 text-ink-muted">
          با این اطلاعات، صفحه اصلی، بسته مطالعاتی و یادآوری‌ها برای آزمون شما چیده می‌شوند؛ روی همه دستگاه‌هایتان.
        </p>
      </div>
      {payload ? (
        <section className="rounded-card bg-surface p-4 shadow-card md:p-6">
          <StudyProfileEditor payload={payload} examTypes={examTypes} subjects={subjects} />
        </section>
      ) : (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">فعلاً در دسترس نیست.</p>
      )}
    </div>
  );
}
