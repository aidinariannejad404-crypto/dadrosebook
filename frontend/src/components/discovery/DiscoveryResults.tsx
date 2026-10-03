import type { ReactNode } from "react";
import type { BookCard as BookCardData, BookFacets, BookQuery, Paginated } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";
import { DEFAULT_ORDERING, PAGE_SIZE, activeFilterCount, hiddenFields, totalPages } from "@/lib/discovery";
import { BookCard } from "@/components/book/BookCard";
import { ActiveFilters } from "./ActiveFilters";
import { FilterPanel } from "./FilterPanel";
import { FilterSheet } from "./FilterSheet";
import { Pagination } from "./Pagination";
import { SortSelect } from "./SortSelect";

interface DiscoveryResultsProps {
  basePath: string;
  query: BookQuery;
  results: Paginated<BookCardData>;
  /** null when the facets call failed: the page still lists books, without the filter panel */
  facets: BookFacets | null;
  /** rendered instead of the grid when nothing matches */
  empty: ReactNode;
}

/**
 * Shared listing layout for /category/<slug> and /search: desktop filter sidebar (lg+), a sticky
 * toolbar (mobile filter sheet, result count, sort), active filter chips, the card grid and pagination.
 */
export function DiscoveryResults({ basePath, query, results, facets, empty }: DiscoveryResultsProps) {
  const page = query.page ?? 1;
  const pages = totalPages(results.count, PAGE_SIZE);
  const active = activeFilterCount(query);

  return (
    <div className="mt-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
      {facets && (
        <aside aria-labelledby="filters-heading" className="hidden lg:block">
          <div className="rounded-card bg-surface p-4 shadow-card">
            <h2 id="filters-heading" className="mb-3 text-base font-extrabold text-ink">
              فیلترها
            </h2>
            <FilterPanel basePath={basePath} query={query} facets={facets} idPrefix="side" />
          </div>
        </aside>
      )}

      <div className="min-w-0">
        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg px-4 py-2 lg:static lg:mx-0 lg:rounded-card lg:border-0 lg:bg-surface lg:px-4 lg:shadow-card">
          {facets && (
            <div className="lg:hidden">
              <FilterSheet activeCount={active} resultCount={results.count}>
                <FilterPanel basePath={basePath} query={query} facets={facets} idPrefix="sheet" />
              </FilterSheet>
            </div>
          )}
          <p className="text-sm font-bold text-ink" aria-live="polite">
            {toPersianDigits(results.count)} کتاب
          </p>
          <div className="ms-auto">
            <SortSelect
              key={query.ordering ?? DEFAULT_ORDERING}
              action={basePath}
              value={query.ordering ?? DEFAULT_ORDERING}
              hidden={hiddenFields(query, ["ordering"])}
            />
          </div>
        </div>

        {active > 0 && (
          <div className="mt-3">
            <ActiveFilters basePath={basePath} query={query} facets={facets} />
          </div>
        )}

        {results.results.length > 0 ? (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {results.results.map((book, i) => (
                <li key={book.id}>
                  <BookCard book={book} priority={i < 2} showNotify />
                </li>
              ))}
            </ul>
            <Pagination basePath={basePath} query={query} page={page} total={pages} />
          </>
        ) : (
          <div className="mt-4">{empty}</div>
        )}
      </div>
    </div>
  );
}
