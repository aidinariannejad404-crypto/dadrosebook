"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { ExamTypeMini, SubjectMini } from "@/lib/types";
import type { StudyProfilePayload } from "@/lib/platform-types";
import { apiFetch } from "@/lib/session";
import { loadNavSummary, patchNavSummary, useNavSummary } from "@/lib/nav-summary";
import {
  initialProfileInput,
  onboardingAllowedOn,
  readExamCookie,
  setOnboardingActive,
  syncExamCookie,
  takeOnboardingPending,
} from "@/lib/onboarding";
import { platformRoutes } from "@/lib/platform-routes";
import { StudyProfileForm } from "./StudyProfileForm";

/**
 * PF-8: the 3-tap «آزمون شما» bottom sheet after the first OTP login (shown once; «بعداً» skips it
 * for good, the same form lives at /account/study-profile). Mounted once in the root layout.
 * For returning customers with a saved profile it only re-syncs the `exam` cookie.
 */
export function OnboardingSheet({ examTypes, subjects }: { examTypes: ExamTypeMini[]; subjects: SubjectMini[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useNavSummary();
  const [payload, setPayload] = useState<StudyProfilePayload | null>(null);
  const [open, setOpen] = useState(false);

  // a saved profile drives the exam cookie on this device too
  useEffect(() => {
    if (data?.exam_type) syncExamCookie(data.exam_type);
  }, [data?.exam_type]);

  useEffect(() => {
    if (!data?.show_onboarding || open || !onboardingAllowedOn(pathname) || pathname === platformRoutes.studyProfile) return;
    if (!takeOnboardingPending()) return;
    setOnboardingActive(true);
    let alive = true;
    void apiFetch<StudyProfilePayload>("/me/study-profile/").then((res) => {
      if (alive && res.ok && res.data.show_onboarding) {
        setPayload(res.data);
        setOpen(true);
      } else setOnboardingActive(false);
    });
    return () => {
      alive = false;
    };
  }, [data?.show_onboarding, pathname, open]);

  if (!payload || examTypes.length === 0) return null;

  const done = () => {
    setOpen(false);
    setOnboardingActive(false);
    patchNavSummary({ show_onboarding: false });
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        // closing with Esc or the backdrop counts as «بعداً»
        void apiFetch("/me/study-profile/skip/", { method: "POST" });
        done();
      }}
      title="برای پیشنهادهای دقیق‌تر، سه سؤال کوتاه"
      placement="sheet"
    >
      <StudyProfileForm
        variant="sheet"
        examTypes={examTypes}
        subjects={subjects}
        meta={payload}
        initial={initialProfileInput(payload.profile, typeof document === "undefined" ? null : readExamCookie(document.cookie))}
        onSaved={(p) => {
          patchNavSummary({ exam_type: p.profile.exam_type });
          done();
          void loadNavSummary(true);
          router.refresh(); // the exam cookie changed: re-render personalised server pages
        }}
        onSkip={() => {
          void apiFetch("/me/study-profile/skip/", { method: "POST" });
          done();
        }}
      />
    </Dialog>
  );
}
