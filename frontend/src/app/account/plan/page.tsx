import type { Metadata } from "next";
import Link from "next/link";
import type { LibraryEntry } from "@/lib/account-types";
import { getExamTypes } from "@/lib/api";
import { selectedExamSlug } from "@/lib/exam-server";
import { serverApiGet } from "@/lib/server-session";
import { routes } from "@/lib/config";
import type { ExamTypeMini } from "@/lib/types";
import type { LivingPlan } from "@/lib/study";
import { CreatePlanForm } from "@/components/study/CreatePlanForm";
import { LivingPlanView } from "@/components/study/LivingPlanView";
import { EmptyState } from "@/components/account/EmptyState";
import { CalendarIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "برنامه مطالعه من", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** ه۵: the account-linked living plan; without one, build it from the books the user owns. */
export default async function StudyPlanAccountPage() {
  const [plan, library] = await Promise.all([
    safe(serverApiGet<LivingPlan>("/study/plan/")),
    safe(serverApiGet<LibraryEntry[]>("/library/")),
  ]);
  const readable = (library ?? []).filter((e) => e.can_read).map((e) => e.book.slug);
  if (plan) return <LivingPlanView initial={plan} readable={readable} />;

  const [owned, examTypes, exam] = await Promise.all([
    safe(serverApiGet<{ slug: string; title: string; pages: number }[]>("/study/owned-books/")),
    safe(getExamTypes()),
    selectedExamSlug(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-ink">برنامه مطالعه من</h1>
      <p className="text-sm leading-7 text-ink-muted">
        برنامه زنده هر روز می‌گوید چه صفحه‌هایی را بخوانید، با کتابخوان خودکار جلو می‌رود و اگر عقب افتادید، با یک لمس
        تا روز آزمون فشرده می‌شود. اگر قبلاً برنامه پیامکی گرفته‌اید، در همان صفحه «پیگیری روزانه در حساب من» را بزنید.
      </p>
      {owned && owned.length > 0 ? (
        <CreatePlanForm books={owned} examTypes={(examTypes ?? []) as ExamTypeMini[]} defaultExam={exam} />
      ) : (
        <EmptyState
          icon={<CalendarIcon size={36} />}
          title="هنوز کتابی برای برنامه ندارید"
          href={routes.kit}
          action="ساخت بسته مطالعاتی"
        >
          کتاب‌های آزمونتان را بخرید یا از صفحه کتاب‌ها «برنامه مطالعه رایگان» بگیرید؛ برنامه همین‌جا به حساب شما وصل
          می‌شود.
        </EmptyState>
      )}
      <p className="text-xs text-ink-muted">
        <Link href={routes.kit} className="font-bold text-primary underline underline-offset-4">
          کیت آزمون
        </Link>{" "}
        را ببینید تا منبع ضروری هیچ درسی جا نماند.
      </p>
    </div>
  );
}
