"use client";

import { GridIcon } from "@/components/ui/Icons";
import { libraryTabEnabled, useNavSummary } from "@/lib/nav-summary";

/** Fired on window to open the bottom nav's «دسته‌ها» sheet from elsewhere (PF-9). */
export const OPEN_CATEGORIES_EVENT = "dadrose:open-categories";

/**
 * PF-9: when «کتابخانه» replaces «دسته‌ها» in the mobile tab bar, the exam/subject sheet stays one
 * tap away from the header's category row.
 */
export function OpenCategoriesButton() {
  const { data } = useNavSummary();
  if (!libraryTabEnabled(data)) return null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new Event(OPEN_CATEGORIES_EVENT))}
      className="ms-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft md:hidden"
    >
      <GridIcon size={18} />
      همه دسته‌ها
    </button>
  );
}
