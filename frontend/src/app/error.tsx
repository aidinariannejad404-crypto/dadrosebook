"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-xl font-extrabold text-ink">مشکلی پیش آمد</h1>
      <p className="mt-2 leading-8 text-ink-muted">
        بارگذاری این صفحه با خطا روبه‌رو شد. چند لحظه دیگر دوباره تلاش کنید.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
        >
          تلاش دوباره
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-5 font-bold text-ink hover:bg-primary-soft">
          صفحه اصلی
        </Link>
      </div>
    </div>
  );
}
