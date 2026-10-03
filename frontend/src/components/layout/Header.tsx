import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import { CartBadge } from "@/components/cart/CartBadge";
import { SearchAutocomplete } from "@/components/discovery/SearchAutocomplete";
import { UserChip } from "@/components/auth/UserChip";

/** Site header: logo, search autocomplete (Phase 2), login state (Phase 3: client-side UserChip so catalog pages stay ISR), cart badge (Phase 2). */
export function Header({ fixtures = false }: { fixtures?: boolean }) {
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

        <SearchAutocomplete fixtures={fixtures} className="order-3 w-full md:order-2 md:mx-4 md:max-w-xl md:flex-1" />

        <nav aria-label="حساب کاربری و سبد خرید" className="order-2 ms-auto flex items-center gap-1 md:order-3 md:ms-0">
          <UserChip />
          <CartBadge />
        </nav>
      </div>
    </header>
  );
}
