import Link from "next/link";
import type { ExamTypeMini } from "@/lib/types";
import { routes } from "@/lib/config";

/**
 * «آزمون من» (P1-3): each chip is a submit button of a plain POST form to /exam/select, which stores the
 * slug in the `exam` cookie and reloads the homepage for that exam — no client JS.
 */
export function ExamChips({ examTypes, selected }: { examTypes: ExamTypeMini[]; selected: ExamTypeMini | null }) {
  if (examTypes.length === 0) return null;
  return (
    <section id="exam" aria-labelledby="exam-chips-title" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="exam-chips-title" className="text-base font-extrabold text-ink">
          {selected ? "آزمون من" : "آزمون شما کدام است؟"}
        </h2>
        {selected ? (
          <form action={routes.examSelect} method="post" className="flex items-center gap-1 text-sm text-ink-muted">
            <p>
              نمایش برای: <strong className="text-ink">{selected.name}</strong>
            </p>
            <span aria-hidden="true">·</span>
            <button
              type="submit"
              name="exam"
              value=""
              className="inline-flex min-h-11 items-center rounded-control px-2 font-bold text-primary underline-offset-4 hover:bg-primary-soft hover:underline"
            >
              تغییر
              <span className="sr-only"> (نمایش همه آزمون‌ها)</span>
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">پرفروش‌ها، سریع‌خوان‌ها و شمارش معکوس برای آزمون شما</p>
        )}
      </div>
      <form action={routes.examSelect} method="post">
        <ul className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          {examTypes.map((e) => {
            const active = selected?.slug === e.slug;
            return (
              <li key={e.id} className="shrink-0">
                <button
                  type="submit"
                  name="exam"
                  value={active ? "" : e.slug}
                  aria-pressed={active}
                  className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-colors ${
                    active
                      ? "border-primary bg-primary text-white hover:bg-primary-hover"
                      : "border-line-strong bg-surface text-ink hover:border-primary hover:bg-primary-soft"
                  }`}
                >
                  {e.name}
                </button>
              </li>
            );
          })}
        </ul>
      </form>
      {selected && (
        <Link
          prefetch={false}
          href={routes.exam(selected.slug)}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
        >
          همه منابع {selected.name}
        </Link>
      )}
    </section>
  );
}
