import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { CartIcon, SearchIcon, UserIcon } from "@/components/ui/Icons";

/** Site header: logo, search (GET /search — page arrives in Phase 2), login (Phase 3), cart (Phase 2). */
export function Header({ cartCount = 0 }: { cartCount?: number }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-site flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:flex-nowrap md:py-3">
        <Link href="/" className="order-1 flex min-h-11 shrink-0 items-center gap-2 rounded-control" aria-label={`${SITE_NAME} — صفحه اصلی`}>
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-[10px] bg-primary text-lg font-black text-accent">
            د
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-black text-primary">{SITE_NAME}</span>
            <span className="text-[0.6875rem] font-medium text-ink-muted">منابع آزمون وکالت و قضاوت</span>
          </span>
        </Link>

        <form action="/search" method="get" role="search" className="order-3 w-full md:order-2 md:mx-4 md:max-w-xl md:flex-1">
          <label htmlFor="site-search" className="sr-only">
            جستجو در کتاب‌ها
          </label>
          <div className="relative">
            <input
              id="site-search"
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="جستجوی کتاب، نویسنده یا درس…"
              className="h-12 w-full rounded-control border border-line bg-bg pe-12 ps-4 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:bg-surface"
            />
            <button
              type="submit"
              aria-label="جستجو"
              className="absolute inset-y-0 end-0 inline-flex min-w-12 items-center justify-center rounded-e-control text-primary hover:bg-primary-soft"
            >
              <SearchIcon size={22} />
            </button>
          </div>
        </form>

        <nav aria-label="حساب کاربری و سبد خرید" className="order-2 ms-auto flex items-center gap-1 md:order-3 md:ms-0">
          <Link
            prefetch={false}
            href="/login"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control px-2 text-sm font-bold text-ink hover:bg-primary-soft md:px-3"
          >
            <UserIcon size={22} />
            <span className="hidden sm:inline">ورود / ثبت‌نام</span>
            <span className="sr-only sm:hidden">ورود / ثبت‌نام</span>
          </Link>
          <Link
            prefetch={false}
            href="/cart"
            aria-label={`سبد خرید، ${toPersianDigits(cartCount)} کالا`}
            className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-primary-soft"
          >
            <CartIcon size={24} />
            <span
              aria-hidden="true"
              className="absolute end-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.6875rem] font-extrabold leading-5 text-ink"
            >
              {toPersianDigits(cartCount)}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
