import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { routes } from "@/lib/config";
import { ArrowStartIcon, LockIcon } from "./NavIcons";
import { POLICY_LINKS } from "./Footer";

/** Enclosed checkout header: logo, «پرداخت امن», back to cart. No search, category nav or bottom nav. */
export function CheckoutHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-site items-center gap-3 px-4 py-2">
        <Logo variant="compact" href="/" />
        <p className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success sm:text-sm">
          <LockIcon size={16} className="shrink-0" />
          پرداخت امن
        </p>
        <Link
          prefetch={false}
          href={routes.cart}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
        >
          <ArrowStartIcon size={18} className="shrink-0" />
          <span className="hidden sm:inline">بازگشت به سبد خرید</span>
          <span className="sm:hidden">سبد خرید</span>
        </Link>
      </div>
    </header>
  );
}

/** Minimal checkout footer: policy links only (trust while paying, no distractions). */
export function CheckoutFooter() {
  return (
    <footer className="mt-10 border-t border-line bg-surface">
      <nav aria-label="راهنمای خرید" className="mx-auto max-w-site px-4 py-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-4">
          {POLICY_LINKS.filter((l) => l.href !== "/about").map((l) => (
            <li key={l.href}>
              <Link
                prefetch={false}
                href={l.href}
                className="inline-flex min-h-11 items-center text-sm text-ink-muted underline-offset-4 hover:text-primary hover:underline"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
