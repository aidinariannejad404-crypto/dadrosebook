import Link from "next/link";
import type { ExamTypeMini } from "@/lib/types";
import { routes } from "@/lib/config";

export function ExamChips({ examTypes }: { examTypes: ExamTypeMini[] }) {
  if (examTypes.length === 0) return null;
  return (
    <section aria-labelledby="exam-chips-title">
      <h2 id="exam-chips-title" className="mb-3 text-base font-extrabold text-ink">
        منابع بر اساس آزمون
      </h2>
      <ul className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {examTypes.map((e) => (
          <li key={e.id} className="shrink-0">
            <Link
              prefetch={false}
              href={routes.search({ exam_type: e.slug })}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink transition-colors hover:border-primary hover:bg-primary hover:text-white"
            >
              {e.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
