import Link from "next/link";
import type { BookQuery } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";
import { hrefFor, pageWindow, withPage } from "@/lib/discovery";
import { ChevronIcon } from "@/components/ui/Icons";

interface PaginationProps {
  basePath: string;
  query: BookQuery;
  page: number;
  total: number;
}

/** Numbered pagination with Persian digits; prev/next carry rel=prev/next (also emitted as <link>s). */
export function Pagination({ basePath, query, page, total }: PaginationProps) {
  if (total <= 1) return null;
  const href = (p: number) => hrefFor(basePath, withPage(query, p));
  const prev = page > 1 ? href(page - 1) : null;
  const next = page < total ? href(page + 1) : null;
  const item = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-2 text-sm font-bold";
  return (
    <nav aria-label="صفحه‌بندی نتایج" className="mt-8 flex justify-center">
      {prev && <link rel="prev" href={prev} />}
      {next && <link rel="next" href={next} />}
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {prev ? (
            <Link href={prev} rel="prev" className={`${item} gap-1 text-primary hover:bg-primary-soft`}>
              {/* chevron points right = backwards in RTL */}
              <ChevronIcon size={18} className="rotate-180" />
              قبلی
            </Link>
          ) : (
            <span className={`${item} gap-1 text-ink-muted opacity-60`} aria-disabled="true">
              <ChevronIcon size={18} className="rotate-180" />
              قبلی
            </span>
          )}
        </li>
        {pageWindow(page, total).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-muted">
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span aria-current="page" className={`${item} bg-primary text-white`}>
                  <span className="sr-only">صفحه </span>
                  {toPersianDigits(p)}
                </span>
              ) : (
                <Link href={href(p)} className={`${item} border border-line bg-surface text-ink hover:border-primary hover:bg-primary-soft`}>
                  <span className="sr-only">صفحه </span>
                  {toPersianDigits(p)}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          {next ? (
            <Link href={next} rel="next" className={`${item} gap-1 text-primary hover:bg-primary-soft`}>
              بعدی
              <ChevronIcon size={18} />
            </Link>
          ) : (
            <span className={`${item} gap-1 text-ink-muted opacity-60`} aria-disabled="true">
              بعدی
              <ChevronIcon size={18} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
