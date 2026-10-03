import { BookCardSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Loading state for /category/<slug> and /search (same layout as DiscoveryResults). */
export function DiscoverySkeleton() {
  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-4" role="status" aria-label="در حال بارگذاری">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-56" />
      <DiscoveryResultsSkeleton />
    </div>
  );
}

/** Sidebar + toolbar + grid placeholders (also the in-page Suspense fallback on category pages). */
export function DiscoveryResultsSkeleton() {
  return (
      <div className="mt-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]" aria-busy="true">
        <div className="hidden flex-col gap-3 rounded-card bg-surface p-4 shadow-card lg:flex">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-28 lg:hidden" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="ms-auto h-11 w-40" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <BookCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
  );
}
