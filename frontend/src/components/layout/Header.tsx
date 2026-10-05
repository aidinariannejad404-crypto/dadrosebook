import { Logo } from "@/components/brand/Logo";
import { CartBadge } from "@/components/cart/CartBadge";
import { SearchAutocomplete } from "@/components/discovery/SearchAutocomplete";
import { UserChip } from "@/components/auth/UserChip";
import styles from "./Header.module.css";

/**
 * Site header: logo, search autocomplete, login state (client-side UserChip so catalog pages stay ISR)
 * and cart badge. Sticky (pure CSS, see Header.module.css): on mobile only the search row stays pinned.
 */
export function Header({ fixtures = false }: { fixtures?: boolean }) {
  return (
    <header className={`${styles.header} border-b border-line bg-surface`}>
      <div className="mx-auto flex max-w-site flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:flex-nowrap md:py-2">
        <Logo variant="header" href="/" priority className="order-1" />

        <SearchAutocomplete fixtures={fixtures} className="order-3 w-full md:order-2 md:mx-4 md:max-w-xl md:flex-1" />

        <nav aria-label="حساب کاربری و سبد خرید" className="order-2 ms-auto flex items-center gap-1 md:order-3 md:ms-0">
          <UserChip />
          <CartBadge />
        </nav>
      </div>
    </header>
  );
}
