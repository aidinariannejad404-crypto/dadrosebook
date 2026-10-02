export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-control bg-primary-tint ${className}`} />;
}

export function BookCardSkeleton() {
  return (
    <div className="rounded-card bg-surface p-2.5 shadow-card">
      <Skeleton className="aspect-[2/3] w-full" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton className="mt-4 h-4 w-2/3" />
    </div>
  );
}
