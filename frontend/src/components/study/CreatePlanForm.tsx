"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { trackStudyPlanLinked } from "@/lib/analytics";
import { apiFetch, errorMessage } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import type { ExamTypeMini } from "@/lib/types";
import type { LivingPlan } from "@/lib/study";

/** Build a plan from the books the user owns, up to the chosen exam's next date. */
export function CreatePlanForm({
  books,
  examTypes,
  defaultExam,
}: {
  books: { slug: string; title: string; pages: number }[];
  examTypes: ExamTypeMini[];
  defaultExam: string | null;
}) {
  const router = useRouter();
  const examId = useId();
  const hoursId = useId();
  const [chosen, setChosen] = useState<string[]>(books.slice(0, 6).map((b) => b.slug));
  const [exam, setExam] = useState(defaultExam ?? "");
  const [hours, setHours] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen.length) return setError("دست‌کم یک کتاب انتخاب کنید.");
    setBusy(true);
    setError("");
    const res = await apiFetch<LivingPlan>("/study/plan/", {
      method: "POST",
      json: { book_slugs: chosen, exam_type: exam || null, hours_per_day: hours },
    });
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error, "book_slugs", "ساخت برنامه انجام نشد. دوباره تلاش کنید."));
    trackStudyPlanLinked({ source: "library" });
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-card bg-surface p-4 shadow-card md:p-5">
      <fieldset>
        <legend className="text-sm font-bold text-ink">کتاب‌هایی که می‌خواهید در برنامه باشند</legend>
        <ul className="mt-2 space-y-1">
          {books.map((b) => (
            <li key={b.slug}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="size-5 accent-[color:var(--color-primary)]"
                  checked={chosen.includes(b.slug)}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, b.slug] : c.filter((s) => s !== b.slug)))
                  }
                />
                <span className="min-w-0 flex-1">{b.title}</span>
                <span className="shrink-0 text-xs text-ink-muted">{toPersianDigits(b.pages)} صفحه</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={examId} className="text-sm font-bold text-ink">
            آزمون
          </label>
          <select
            id={examId}
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="">بدون تاریخ آزمون (۳۰ روزه)</option>
            {examTypes.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={hoursId} className="text-sm font-bold text-ink">
            ساعت مطالعه در روز
          </label>
          <select
            id={hoursId}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          >
            {[2, 3, 4, 5, 6, 8, 10].map((h) => (
              <option key={h} value={h}>
                {toPersianDigits(h)} ساعت
              </option>
            ))}
          </select>
        </div>
      </div>
      <p role="alert" className="text-sm font-bold text-danger empty:hidden">
        {error}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "در حال ساخت…" : "ساخت برنامه"}
      </button>
    </form>
  );
}
