import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Route-level loading states (ج۲). Each mirrors the real page's outer geometry (same container,
 * grid columns and block heights) so the swap to real content does not shift the layout.
 */

const status = { role: "status", "aria-label": "در حال بارگذاری", "aria-busy": true } as const;

function BreadcrumbSkeleton() {
  return (
    <div className="flex h-11 items-center">
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

function PurchasePanelSkeleton() {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <Skeleton className="h-5 w-24" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="mt-4 h-8 w-40" />
      <Skeleton className="mt-4 h-12 w-full" />
      <Skeleton className="mt-3 h-4 w-3/4" />
    </div>
  );
}

/** /product/<slug>: breadcrumb, cover column, info column, buy box (own column on desktop). */
export function ProductSkeleton() {
  return (
    <div className="mx-auto min-h-[150vh] max-w-site px-4 pt-2 md:pt-4" {...status}>
      <BreadcrumbSkeleton />
      <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="mx-auto aspect-[2/3] w-full max-w-[12rem] rounded-card md:max-w-none" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="flex min-w-0 flex-col">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-8 w-11/12" />
          <Skeleton className="mt-2 h-8 w-2/3 md:hidden" />
          <Skeleton className="mt-4 h-4 w-1/2" />
          <Skeleton className="mt-2 h-4 w-1/3" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="mt-6 lg:hidden">
            <PurchasePanelSkeleton />
          </div>
          <Skeleton className="mt-4 h-20 w-full rounded-card" />
          <div className="mt-5 grid grid-cols-2 gap-px sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-none" />
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
          <PurchasePanelSkeleton />
        </div>
      </div>
    </div>
  );
}

/** /kit: header, exam chips, subject checklist grid + summary aside. */
export function KitSkeleton() {
  return (
    <div className="mx-auto min-h-[150vh] max-w-site px-4 py-5 md:py-8" {...status}>
      <div className="mb-5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-md" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-24 rounded-full" />
            ))}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-12 w-full" />
              </li>
            ))}
          </ul>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 w-full rounded-card" />
              <Skeleton className="h-24 w-full rounded-card" />
            </div>
          ))}
        </div>
        <div className="rounded-card bg-surface p-4 shadow-card md:p-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <Skeleton className="mt-4 h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Lines + summary card (the cart page and CartView's own loading state share this). */
export function CartBodySkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]" aria-busy="true">
      <ul className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex gap-3 rounded-card bg-surface p-3 shadow-card">
            <Skeleton className="aspect-[2/3] w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="rounded-card bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-3 h-4 w-2/3" />
        <Skeleton className="mt-5 h-12 w-full" />
      </div>
    </div>
  );
}

export function CartSkeleton() {
  return (
    <div className="mx-auto min-h-[100vh] max-w-site px-4 py-5 md:py-8" {...status}>
      <Skeleton className="mb-4 h-8 w-32" />
      <CartBodySkeleton />
    </div>
  );
}

/** Content area of /account/* (the account shell and nav stay on screen). */
export function AccountContentSkeleton() {
  return (
    <div className="min-h-[60vh] space-y-3" {...status}>
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-card bg-surface p-4 shadow-card">
          <Skeleton className="aspect-[2/3] w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            <Skeleton className="mt-4 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

