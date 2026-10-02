import Link from "next/link";
import type { CategoryNode } from "@/lib/types";
import { routes } from "@/lib/config";

/** Top-level categories; horizontal scroll on mobile. */
export function CategoryNav({ categories }: { categories: CategoryNode[] }) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label="دسته‌بندی کتاب‌ها" className="border-b border-line bg-surface">
      <ul className="relative mx-auto flex max-w-site gap-1 overflow-x-auto px-2 [scrollbar-width:none] md:px-4">
        {categories.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              prefetch={false}
              href={routes.category(c.slug)}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm font-medium text-ink hover:bg-primary-soft hover:text-primary"
            >
              {c.name}
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
              prefetch={false}
            href={routes.kit}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            بسته مطالعاتی
          </Link>
        </li>
      </ul>
    </nav>
  );
}
