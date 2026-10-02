"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { submitStudyPlan } from "@/lib/api";
import { track } from "@/lib/analytics";
import { normalizeMobile, PHONE_ERROR } from "@/lib/phone";
import type { StudyPlanField } from "@/lib/study-plan";
import type { ExamTypeMini, SubjectMini } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";

export interface StudyPlanFormProps {
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
  /** «آزمون من» cookie slug */
  defaultExam: string | null;
  /** preselected subject slugs (the current book's) */
  defaultSubjects: string[];
  /** the current book, preselected */
  book: { slug: string; title: string } | null;
  /** USE_API_FIXTURES on the server: answer locally */
  fixtures: boolean;
}

const HOURS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
type Errors = Partial<Record<StudyPlanField, string>>;

const field =
  "mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink aria-[invalid=true]:border-danger";

export function StudyPlanForm({ examTypes, subjects, defaultExam, defaultSubjects, book, fixtures }: StudyPlanFormProps) {
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // the form mounts after the dialog opened: start on the first field
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input[name="phone"]')?.focus();
  }, []);
  const fallbackExam = examTypes.find((e) => e.slug === defaultExam)?.slug ?? examTypes[0]?.slug ?? "";

  function focusFirstError(errs: Errors) {
    const order: StudyPlanField[] = ["phone", "exam_type", "subjects", "hours_per_day", "consent", "form"];
    const first = order.find((f) => errs[f]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const phone = normalizeMobile(String(data.get("phone") ?? ""));
    const exam = String(data.get("exam_type") ?? "");
    const chosen = data.getAll("subjects").map(String);
    const hours = Number(data.get("hours_per_day") ?? 6);
    const consent = data.get("consent") === "on";
    const books = book && data.get("book") === "on" ? [book.slug] : [];

    const errs: Errors = {};
    if (!phone) errs.phone = PHONE_ERROR;
    if (!exam) errs.exam_type = "آزمون را انتخاب کنید.";
    if (chosen.length === 0) errs.subjects = "دست‌کم یک درس را انتخاب کنید.";
    if (!consent) errs.consent = "برای دریافت برنامه، موافقت با دریافت پیامک لازم است.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }

    setBusy(true);
    const result = await submitStudyPlan(
      { phone: phone!, exam_type: exam, subjects: chosen, books, hours_per_day: hours, consent },
      { fixtures },
    );
    if (!result.ok) {
      setBusy(false);
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }
    track("study_plan_requested", {
      exam_type: exam,
      subjects: chosen.join(","),
      subjects_count: chosen.length,
      hours_per_day: hours,
      book: books[0] ?? null,
    });
    const url = result.data.plan_url.startsWith("/plan/") ? result.data.plan_url : `/plan/${encodeURIComponent(result.data.token)}`;
    router.push(url);
  }

  const err = (f: StudyPlanField) =>
    errors[f] ? (
      <p id={`${id}-${f}-err`} className="mt-1.5 text-sm font-bold text-danger">
        {errors[f]}
      </p>
    ) : null;
  const described = (f: StudyPlanField, extra?: string) =>
    [errors[f] ? `${id}-${f}-err` : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onChange={(e) => {
        // a corrected field drops its message (the rest stay until the next submit)
        const name = (e.target as unknown as HTMLInputElement).name;
        const key = (name === "book" ? "books" : name) as StudyPlanField;
        if (!errors[key] && !errors.form) return;
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          delete next.form;
          return next;
        });
      }}
      noValidate
      className="space-y-5"
    >
      <p className="text-sm leading-7 text-ink-muted">
        روزبه‌روز تا آزمون: چه صفحه‌ای از کدام کتاب را بخوانید و کدام روزها جمع‌بندی کنید. رایگان است و
        بلافاصله آماده می‌شود.
      </p>

      {errors.form && (
        <p role="alert" tabIndex={-1} data-field="form" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {errors.form}
        </p>
      )}

      <div>
        <label htmlFor={`${id}-phone`} className="text-sm font-bold text-ink">
          شماره موبایل
        </label>
        <input
          id={`${id}-phone`}
          data-field="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          dir="ltr"
          placeholder={toPersianDigits("09121234567")}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={described("phone", `${id}-phone-hint`)}
          required
          className={`${field} text-end tracking-wider placeholder:text-ink-muted`}
        />
        <p id={`${id}-phone-hint`} className="mt-1 text-xs text-ink-muted">
          با ارقام فارسی یا انگلیسی؛ مثل ۰۹۱۲۱۲۳۴۵۶۷
        </p>
        {err("phone")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-exam`} className="text-sm font-bold text-ink">
            آزمون
          </label>
          <select
            id={`${id}-exam`}
            data-field="exam_type"
            name="exam_type"
            defaultValue={fallbackExam}
            aria-invalid={errors.exam_type ? true : undefined}
            aria-describedby={described("exam_type")}
            className={field}
          >
            {examTypes.map((e) => (
              <option key={e.id} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
          {err("exam_type")}
        </div>
        <div>
          <label htmlFor={`${id}-hours`} className="text-sm font-bold text-ink">
            مطالعه در روز
          </label>
          <select
            id={`${id}-hours`}
            data-field="hours_per_day"
            name="hours_per_day"
            defaultValue={6}
            aria-invalid={errors.hours_per_day ? true : undefined}
            aria-describedby={described("hours_per_day")}
            className={field}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {toPersianDigits(h)} ساعت
              </option>
            ))}
          </select>
          {err("hours_per_day")}
        </div>
      </div>

      <fieldset aria-describedby={described("subjects")}>
        <legend className="text-sm font-bold text-ink">درس‌ها</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {subjects.map((s, i) => (
            <label key={s.id} className="relative cursor-pointer">
              <input
                type="checkbox"
                name="subjects"
                value={s.slug}
                defaultChecked={defaultSubjects.includes(s.slug)}
                data-field={i === 0 ? "subjects" : undefined}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </span>
            </label>
          ))}
        </div>
        {err("subjects")}
      </fieldset>

      {book && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control bg-bg px-3 py-2.5 text-sm leading-6 text-ink">
          <input type="checkbox" name="book" defaultChecked className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" />
          <span>
            کتاب «<strong>{book.title}</strong>» در برنامه باشد
          </span>
        </label>
      )}

      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
          <input
            type="checkbox"
            name="consent"
            data-field="consent"
            required
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={described("consent")}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          <span>با دریافت پیامک‌های مرتبط با آزمون موافقم</span>
        </label>
        {err("consent")}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover disabled:cursor-wait disabled:opacity-80"
      >
        {busy ? "در حال ساختن برنامه…" : "ساختن برنامه من"}
      </button>
      <p className="text-center text-xs leading-6 text-ink-muted">
        شماره شما فقط برای برنامه مطالعه و پیامک‌های مرتبط با آزمون استفاده می‌شود.
      </p>
    </form>
  );
}
