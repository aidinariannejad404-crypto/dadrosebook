import Link from "next/link";
import type { CategoryNode, ExamTypeMini, SubjectMini } from "@/lib/types";
import { routes } from "@/lib/config";
import { MegaMenu } from "./MegaMenu";
import { NavLink } from "./NavLink";

function descendantPaths(node: CategoryNode): string[] {
  return node.children.flatMap((c) => [routes.category(c.slug), ...descendantPaths(c)]);
}

/** Desktop mega menu panel: one column per exam, each listing the subjects (exam × subject search). */
function ExamSubjectPanel({ examTypes, subjects }: { examTypes: ExamTypeMini[]; subjects: SubjectMini[] }) {
  return (
    <div className="mx-auto max-w-site px-4 py-5">
      <div className="grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(${Math.min(examTypes.length, 5)}, minmax(0, 1fr))` }}>
        {examTypes.map((exam) => {
          const headingId = `mega-exam-${exam.id}`;
          return (
            <section key={exam.id} aria-labelledby={headingId}>
              <h3 id={headingId} className="border-b border-line pb-1">
                <Link
                  prefetch={false}
                  href={routes.search({ exam_type: exam.slug })}
                  className="inline-flex min-h-11 items-center text-sm font-extrabold text-primary hover:underline"
                >
                  آزمون {exam.name}
                </Link>
              </h3>
              <ul className="mt-1">
                {subjects.map((s) => (
                  <li key={s.id}>
                    <Link
                      prefetch={false}
                      href={routes.search({ exam_type: exam.slug, subject: s.slug })}
                      className="flex min-h-11 items-center rounded-control px-1 text-sm text-ink hover:bg-primary-soft hover:text-primary"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    prefetch={false}
                    href={routes.search({ exam_type: exam.slug })}
                    className="flex min-h-11 items-center px-1 text-sm font-bold text-primary underline-offset-4 hover:underline"
                  >
                    مشاهده همه منابع {exam.short_name || exam.name}
                  </Link>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {[
          { href: routes.kit, label: "بسته مطالعاتی آزمون" },
          { href: routes.search({ quick_review: "true" }), label: "سریع‌خوان و جمع‌بندی" },
          { href: routes.search({ format: "ebook" }), label: "کتاب‌های الکترونیک" },
          { href: routes.search(), label: "همه کتاب‌ها" },
        ].map((l) => (
          <Link
            key={l.href}
            prefetch={false}
            href={l.href}
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-bold text-ink hover:border-primary hover:bg-primary-soft"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Top-level categories with scope highlighting (horizontal scroll on mobile) and, on desktop,
 * the «آزمون‌ها و دروس» mega menu.
 */
export function CategoryNav({
  categories,
  examTypes = [],
  subjects = [],
}: {
  categories: CategoryNode[];
  examTypes?: ExamTypeMini[];
  subjects?: SubjectMini[];
}) {
  if (categories.length === 0 && examTypes.length === 0) return null;
  return (
    <nav aria-label="دسته‌بندی کتاب‌ها" className="relative border-b border-line bg-surface">
      <div className="mx-auto flex max-w-site items-center gap-2 md:px-4">
        {examTypes.length > 0 && subjects.length > 0 && (
          <MegaMenu label="آزمون‌ها و دروس">
            <ExamSubjectPanel examTypes={examTypes} subjects={subjects} />
          </MegaMenu>
        )}
        <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 [scrollbar-width:none] md:px-0">
          {categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <NavLink href={routes.category(c.slug)} within={descendantPaths(c)} className="font-medium text-ink">
                {c.name}
              </NavLink>
            </li>
          ))}
          <li className="shrink-0">
            <NavLink href={routes.kit} className="font-bold text-primary">
              بسته مطالعاتی
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
