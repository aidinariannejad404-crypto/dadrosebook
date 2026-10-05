import type { CategoryNode, ExamTypeMini, SubjectMini } from "@/lib/types";
import { routes } from "@/lib/config";
import { MegaMenu } from "./MegaMenu";
import { NavLink } from "./NavLink";

function descendantPaths(node: CategoryNode): string[] {
  return node.children.flatMap((c) => [routes.category(c.slug), ...descendantPaths(c)]);
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
          <MegaMenu label="آزمون‌ها و دروس" examTypes={examTypes} subjects={subjects} />
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
