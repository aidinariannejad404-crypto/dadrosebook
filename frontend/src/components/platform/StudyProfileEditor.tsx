"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExamTypeMini, SubjectMini } from "@/lib/types";
import type { StudyProfilePayload } from "@/lib/platform-types";
import { initialProfileInput, readExamCookie } from "@/lib/onboarding";
import { patchNavSummary } from "@/lib/nav-summary";
import { StudyProfileForm } from "./StudyProfileForm";

/** /account/study-profile: the onboarding questions, all on one page. */
export function StudyProfileEditor({
  payload,
  examTypes,
  subjects,
}: {
  payload: StudyProfilePayload;
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <StudyProfileForm
        variant="page"
        examTypes={examTypes}
        subjects={subjects}
        meta={payload}
        initial={initialProfileInput(payload.profile, typeof document === "undefined" ? null : readExamCookie(document.cookie))}
        onSaved={(p) => {
          setSaved(true);
          patchNavSummary({ show_onboarding: false, exam_type: p.profile.exam_type });
          router.refresh();
        }}
      />
      <p role="status" aria-live="polite" className="mt-3 text-sm font-bold text-success empty:hidden">
        {saved ? "پروفایل مطالعه ذخیره شد؛ پیشنهادهای صفحه اصلی هم بر همین اساس چیده می‌شود." : ""}
      </p>
    </>
  );
}
