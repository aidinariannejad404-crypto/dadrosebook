"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/** With a query string the 404 came from empty filters: offer the unfiltered page; else `fallback`. */
export function FacetNotFound({ fallback }: { fallback: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (!pathname || !params || params.size === 0) return <>{fallback}</>;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-xl font-extrabold text-ink">کتابی با این فیلترها پیدا نشد</h1>
      <p className="mt-2 leading-8 text-ink-muted">چند فیلتر را بردارید یا همه کتاب‌های این دسته را ببینید.</p>
      <Link
        href={pathname}
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"
      >
        حذف همه فیلترها
      </Link>
      <Link href="/" className="mt-3 inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline">
        بازگشت به صفحه اصلی
      </Link>
    </div>
  );
}
