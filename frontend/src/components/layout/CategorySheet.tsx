import Link from "next/link";
import type { CategoryNode, ExamTypeMini, SubjectMini } from "@/lib/types";
import { routes } from "@/lib/config";

const chip =
  "inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:border-primary hover:bg-primary-soft";

/** Content of the mobile «دسته‌ها» bottom sheet: categories, browse by exam, browse by subject. */
export function CategorySheet({
  categories,
  examTypes,
  subjects,
}: {
  categories: CategoryNode[];
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
}) {
  return (
    <div className="space-y-5">
      {categories.length > 0 && (
        <section aria-labelledby="sheet-cats">
          <h3 id="sheet-cats" className="text-sm font-extrabold text-ink-muted">
            دسته‌بندی‌ها
          </h3>
          <ul className="mt-1 divide-y divide-line">
            {categories.map((c) => (
              <li key={c.id}>
                <Link prefetch={false} href={routes.category(c.slug)} className="flex min-h-12 items-center font-bold text-ink hover:text-primary">
                  {c.name}
                </Link>
                {c.children.length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-2">
                    {c.children.map((child) => (
                      <li key={child.id}>
                        <Link prefetch={false} href={routes.category(child.slug)} className={chip}>
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {examTypes.length > 0 && (
        <section aria-labelledby="sheet-exams">
          <h3 id="sheet-exams" className="text-sm font-extrabold text-ink-muted">
            بر اساس آزمون
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {examTypes.map((e) => (
              <li key={e.id}>
                <Link prefetch={false} href={routes.search({ exam_type: e.slug })} className={chip}>
                  {e.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {subjects.length > 0 && (
        <section aria-labelledby="sheet-subjects">
          <h3 id="sheet-subjects" className="text-sm font-extrabold text-ink-muted">
            بر اساس درس
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <Link prefetch={false} href={routes.search({ subject: s.slug })} className={chip}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link
        prefetch={false}
        href={routes.search()}
        className="flex min-h-12 items-center justify-center rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover"
      >
        مشاهده همه کتاب‌ها
      </Link>
    </div>
  );
}
