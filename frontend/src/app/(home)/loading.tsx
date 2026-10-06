import { BookCardSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    // min-h keeps the footer below the fold while the page streams in (no CLS when content replaces the skeleton).
    <div className="mx-auto min-h-[150vh] max-w-site px-4 pt-4 md:pt-6" role="status" aria-label="در حال بارگذاری">
      <Skeleton className="h-56 w-full rounded-card md:h-72" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
