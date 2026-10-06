import { DiscoveryResultsSkeleton } from "@/components/discovery/DiscoverySkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same outer geometry as the category page: breadcrumb row, title, then the results area. */
export default function Loading() {
  return (
    <div className="mx-auto min-h-[150vh] max-w-site px-4 pb-12 pt-2 md:pt-4" role="status" aria-label="در حال بارگذاری">
      <div className="flex h-11 items-center">
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="mt-1 h-7 w-48 md:h-8" />
      <DiscoveryResultsSkeleton />
    </div>
  );
}
