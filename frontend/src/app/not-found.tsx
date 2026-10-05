import type { Metadata } from "next";
import Link from "next/link";
import { NOINDEX } from "@/lib/seo";
import { NotFoundBeacon } from "@/components/seo/NotFoundBeacon";

export const metadata: Metadata = { title: "صفحه پیدا نشد", robots: NOINDEX };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <NotFoundBeacon />
      <p className="text-6xl font-black text-primary">۴۰۴</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
      <p className="mt-2 leading-8 text-ink-muted">
        ممکن است نشانی را اشتباه وارد کرده باشید یا این کتاب دیگر در فروشگاه موجود نباشد.
      </p>
      <form action="/search" method="get" role="search" className="mt-6 flex w-full gap-2">
        <label htmlFor="nf-search" className="sr-only">
          جستجو در کتاب‌ها
        </label>
        <input
          id="nf-search"
          name="q"
          type="search"
          placeholder="نام کتاب یا نویسنده…"
          className="h-12 min-w-0 flex-1 rounded-control border border-line bg-surface px-4 text-base"
        />
        <button type="submit" className="min-h-12 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover">
          جستجو
        </button>
      </form>
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline">
        بازگشت به صفحه اصلی
      </Link>
    </div>
  );
}
