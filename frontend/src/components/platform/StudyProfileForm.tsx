"use client";

import { useId, useState } from "react";
import type { ExamTypeMini, SubjectMini } from "@/lib/types";
import type { StudyProfileInput, StudyProfilePayload } from "@/lib/platform-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { toggleSubject, syncExamCookie, yearLabel } from "@/lib/onboarding";
import { formatJalaliDay } from "@/lib/order-status";
import { toPersianDigits } from "@/lib/format";
import { trackOnboarding } from "@/lib/analytics";
import { CheckIcon } from "@/components/ui/Icons";

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors ${
    on ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink hover:bg-primary-soft"
  }`;
const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-6 text-base font-extrabold text-white hover:bg-primary-hover disabled:opacity-60";
const ghostBtn = "inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-bold text-ink-muted hover:bg-primary-soft hover:text-ink";

export type StudyFormStep = 0 | 1 | 2;

interface Props {
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
  meta: Pick<StudyProfilePayload, "year_choices" | "upcoming_exams" | "max_weak_subjects">;
  initial: StudyProfileInput;
  /** "sheet": one question per step (3 taps); "page": all questions at once (account). */
  variant: "sheet" | "page";
  onSaved: (payload: StudyProfilePayload) => void;
  onSkip?: () => void;
}

/**
 * PF-8 study profile: exam, exam year (or the announced date), 1–3 subjects to strengthen.
 * Saving also stores the exam in the `exam` cookie so the homepage personalisation follows.
 */
export function StudyProfileForm({ examTypes, subjects, meta, initial, variant, onSaved, onSkip }: Props) {
  const id = useId();
  const [value, setValue] = useState<StudyProfileInput>(initial);
  const [step, setStep] = useState<StudyFormStep>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sheet = variant === "sheet";
  const announced = meta.upcoming_exams.filter((e) => e.exam_type === value.exam_type);

  async function save() {
    setBusy(true);
    setError("");
    const res = await apiFetch<StudyProfilePayload>("/me/study-profile/", { method: "PUT", json: value });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.error, "exam_type", errorMessage(res.error, "weak_subjects", "ذخیره نشد. دوباره تلاش کنید.")));
      return;
    }
    syncExamCookie(res.data.profile.exam_type);
    trackOnboarding({ saved: true, exam_type: value.exam_type, exam_year: value.exam_year, weak_subjects: value.weak_subjects.length });
    onSaved(res.data);
  }

  const examStep = (
    <fieldset>
      <legend className="text-base font-extrabold text-ink">برای کدام آزمون می‌خوانید؟</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {examTypes.map((e) => {
          const on = value.exam_type === e.slug;
          return (
            <button
              key={e.slug}
              type="button"
              aria-pressed={on}
              className={chip(on)}
              onClick={() => {
                setValue((v) => ({ ...v, exam_type: on ? null : e.slug, exam_date: on ? null : v.exam_date }));
                if (sheet && !on) setStep(1);
              }}
            >
              {on && <CheckIcon size={16} />}
              {e.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const yearStep = (
    <fieldset>
      <legend className="text-base font-extrabold text-ink">آزمون چه زمانی است؟</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {announced.map((e) => {
          const on = value.exam_date === e.date;
          return (
            <button
              key={e.date}
              type="button"
              aria-pressed={on}
              className={chip(on)}
              onClick={() => {
                setValue((v) => ({ ...v, exam_date: on ? null : e.date, exam_year: null }));
                if (sheet && !on) setStep(2);
              }}
            >
              {e.name} · {formatJalaliDay(e.date)}
            </button>
          );
        })}
        {meta.year_choices.map((y) => {
          const on = value.exam_year === y && !value.exam_date;
          return (
            <button
              key={y}
              type="button"
              aria-pressed={on}
              className={chip(on)}
              onClick={() => {
                setValue((v) => ({ ...v, exam_year: on ? null : y, exam_date: null }));
                if (sheet && !on) setStep(2);
              }}
            >
              سال {yearLabel(y)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const subjectStep = (
    <fieldset>
      <legend className="text-base font-extrabold text-ink">کدام درس‌ها بیشتر تقویت لازم دارند؟</legend>
      <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
        حداکثر {toPersianDigits(meta.max_weak_subjects)} درس؛ پیشنهادها و یادآوری‌ها بر همین اساس چیده می‌شوند.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" aria-describedby={`${id}-hint`}>
        {subjects.map((s) => {
          const on = value.weak_subjects.includes(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              aria-pressed={on}
              className={chip(on)}
              onClick={() => setValue((v) => ({ ...v, weak_subjects: toggleSubject(v.weak_subjects, s.slug, meta.max_weak_subjects) }))}
            >
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const errorLine = (
    <p role="alert" className="text-sm font-bold text-danger empty:hidden">
      {error}
    </p>
  );

  if (!sheet) {
    return (
      <div className="space-y-6">
        {examStep}
        {yearStep}
        {subjectStep}
        {errorLine}
        <button type="button" onClick={save} disabled={busy} className={`${primaryBtn} w-full sm:w-auto`}>
          {busy ? "در حال ذخیره…" : "ذخیره پروفایل مطالعه"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <ol aria-label="مراحل" className="mb-4 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} aria-current={i === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`}>
            <span className="sr-only">مرحله {toPersianDigits(i + 1)} از ۳</span>
          </li>
        ))}
      </ol>
      <div className="min-h-44">{step === 0 ? examStep : step === 1 ? yearStep : subjectStep}</div>
      {errorLine}
      <div className="mt-5 flex items-center justify-between gap-2">
        {step === 0 ? (
          <button
            type="button"
            className={ghostBtn}
            onClick={() => {
              trackOnboarding({ saved: false });
              onSkip?.();
            }}
          >
            بعداً
          </button>
        ) : (
          <button type="button" className={ghostBtn} onClick={() => setStep((s) => (s - 1) as StudyFormStep)}>
            قبلی
          </button>
        )}
        {step < 2 ? (
          <button type="button" className={primaryBtn} onClick={() => setStep((s) => (s + 1) as StudyFormStep)}>
            {(step === 0 && value.exam_type) || (step === 1 && (value.exam_year || value.exam_date)) ? "بعدی" : "رد شدن"}
          </button>
        ) : (
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? "در حال ذخیره…" : "ذخیره"}
          </button>
        )}
      </div>
    </div>
  );
}
