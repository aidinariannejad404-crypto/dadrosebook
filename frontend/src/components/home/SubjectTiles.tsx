import Link from "next/link";
import type { HomeSubject } from "@/lib/types";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { SectionHeader } from "@/components/ui/SectionHeader";

/** Subject tiles in API order (by ضریب when an exam is selected, P1-10). */
export function SubjectTiles({ subjects, examName }: { subjects: HomeSubject[]; examName?: string }) {
  if (subjects.length === 0) return null;
  const weighted = subjects.some((s) => s.weight != null);
  return (
    <section aria-labelledby="subjects-title">
      <SectionHeader
        id="subjects-title"
        title="منابع هر درس"
        subtitle={
          weighted && examName
            ? `به ترتیب ضریب در آزمون ${examName}`
            : "کتاب‌های هر درس آزمون، با رنگ همان درس"
        }
      />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {subjects.map((s) => (
          <li key={s.id}>
            <Link
              prefetch={false}
              href={routes.search({ subject: s.slug })}
              className="relative flex min-h-24 flex-col justify-between overflow-hidden rounded-card p-4 text-white shadow-card transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: s.color }}
            >
              <span aria-hidden="true" className="absolute -end-6 -top-6 size-20 rounded-full bg-white/10" />
              <span aria-hidden="true" className="absolute -bottom-8 end-6 size-16 rounded-full bg-white/[0.07]" />
              <span className="relative text-base font-extrabold leading-7">{s.name}</span>
              <span className="relative mt-2 flex items-center justify-between gap-2 text-xs font-medium text-white">
                <span>{toPersianDigits(s.book_count)} کتاب</span>
                {s.weight != null && (
                  <span className="rounded-full bg-white px-2 py-0.5 font-extrabold text-ink">
                    ضریب {toPersianDigits(s.weight)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
