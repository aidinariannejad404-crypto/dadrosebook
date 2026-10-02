import Link from "next/link";
import type { SubjectWithCount } from "@/lib/types";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function SubjectTiles({ subjects }: { subjects: SubjectWithCount[] }) {
  if (subjects.length === 0) return null;
  return (
    <section aria-labelledby="subjects-title">
      <SectionHeader id="subjects-title" title="منابع هر درس" subtitle="کتاب‌های هر درس آزمون، با رنگ همان درس" />
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
              <span className="relative mt-2 text-xs font-medium text-white">{toPersianDigits(s.book_count)} کتاب</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
