import Link from "next/link";
import type { BookFacets, BookQuery } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { activeChips, clearFilters, hrefFor } from "@/lib/discovery";
import { CloseIcon } from "@/components/ui/Icons";

/** Removable chips for the active filters plus «حذف همه» (plain links). */
export function ActiveFilters({ basePath, query, facets }: { basePath: string; query: BookQuery; facets: BookFacets | null }) {
  const chips = activeChips(query, facets, formatToman);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="فیلترهای فعال" role="group">
      {chips.map((c) => (
        <Link
          key={`${c.key}-${c.value ?? ""}`}
          href={hrefFor(basePath, c.query)}
          prefetch={false}
          rel="nofollow"
          scroll={false}
          className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-line-strong bg-surface pe-2 ps-3 text-sm text-ink hover:border-primary hover:bg-primary-soft"
        >
          {c.color && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />}
          <span className="truncate">{c.label}</span>
          <span className="sr-only">(حذف فیلتر)</span>
          <CloseIcon size={16} className="shrink-0 text-ink-muted" />
        </Link>
      ))}
      <Link
        href={hrefFor(basePath, clearFilters(query))}
        prefetch={false}
        rel="nofollow"
        scroll={false}
        className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
      >
        حذف همه
      </Link>
    </div>
  );
}
