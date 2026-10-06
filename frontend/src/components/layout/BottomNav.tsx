"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useBump } from "@/components/ui/useBump";
import { CartIcon, CloseIcon, GridIcon, PackageIcon, UserIcon } from "@/components/ui/Icons";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { matchesPath } from "./HideOn";
import { HomeIcon } from "./NavIcons";
import styles from "./BottomNav.module.css";
import { CategorySheet } from "./CategorySheet";
// --- platform stream (PF-9): «کتابخانه» replaces «دسته‌ها» for customers who own an ebook ---
import { libraryTabEnabled, useNavSummary } from "@/lib/nav-summary";
import { BookOpenIcon } from "@/components/ui/Icons";
import { OPEN_CATEGORIES_EVENT } from "@/components/platform/OpenCategoriesButton";
import type { CategoryNode, ExamTypeMini, SubjectMini } from "@/lib/types";

/** Routes with their own bottom UI (sticky buy bar, checkout bar, reader): no tab bar there. */
export const BOTTOM_NAV_HIDDEN = { prefixes: ["/product", "/checkout", "/read"] };

/**
 * Pages with their own mobile sticky action bar (cart total, kit builder) keep it above the tab bar.
 * Rendered only while the tab bar is, so it never applies on pages without it.
 */
const LIFT_STICKY_BARS =
  "@media (max-width:767.98px){main .sticky.bottom-0{bottom:calc(3.5rem + env(safe-area-inset-bottom));padding-bottom:0}}";

const tab = (on: boolean) =>
  `press relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[0.6875rem] font-bold ${on ? "text-primary" : "text-ink-muted"}`;

function Indicator({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-accent transition-opacity ${on ? "opacity-100" : "opacity-0"}`}
    />
  );
}

/**
 * Mobile bottom tab bar (below md): خانه / دسته‌ها (bottom sheet) / بسته مطالعاتی / سبد / حساب.
 * The «دسته‌ها» sheet is rendered from plain data only once opened, so its links do not weigh on
 * every page's HTML and RSC payload.
 */
export function BottomNav({
  categories,
  examTypes,
  subjects,
}: {
  categories: CategoryNode[];
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
}) {
  const pathname = usePathname() ?? "/";
  const { count, cart: cartState } = useCart();
  const bump = useBump(count, cartState != null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (sheetOpen && !el.open) el.showModal();
    if (!sheetOpen && el.open) el.close();
  }, [sheetOpen]);

  useEffect(() => setSheetOpen(false), [pathname]);

  // platform stream (PF-9)
  const { data: navSummary } = useNavSummary();
  const showLibrary = libraryTabEnabled(navSummary);
  useEffect(() => {
    const open = () => setSheetOpen(true);
    window.addEventListener(OPEN_CATEGORIES_EVENT, open);
    return () => window.removeEventListener(OPEN_CATEGORIES_EVENT, open);
  }, []);

  if (matchesPath(pathname, BOTTOM_NAV_HIDDEN)) return null;

  const at = (...prefixes: string[]) => matchesPath(pathname, { prefixes });
  const home = pathname === "/";
  const browse = sheetOpen || at("/category", "/search");
  const kit = at(routes.kit);
  const cart = at(routes.cart);
  const library = at(routes.library); // platform stream (PF-9)
  const account = !library && at(routes.account, routes.login);

  return (
    <>
      <style>{LIFT_STICKY_BARS}</style>
      <div aria-hidden="true" className={`${styles.spacer} md:hidden`} />
      <nav
        aria-label="ناوبری اصلی"
        data-bottom-nav=""
        className={`${styles.bar} fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-[0_-4px_16px_rgb(16_24_43/0.08)] md:hidden`}
      >
        <ul className="mx-auto flex h-14 max-w-lg items-stretch">
          <li className="flex flex-1">
            <Link prefetch={false} href="/" aria-current={home ? "page" : undefined} className={tab(home)}>
              <Indicator on={home} />
              <HomeIcon size={24} />
              خانه
            </Link>
          </li>
          {showLibrary ? (
            <li className="flex flex-1">
              <Link prefetch={false} href={routes.library} aria-current={library ? "page" : undefined} className={tab(library)}>
                <Indicator on={library} />
                <BookOpenIcon size={24} />
                کتابخانه
              </Link>
            </li>
          ) : (
          <li className="flex flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-current={browse && !sheetOpen ? "page" : undefined}
              onClick={() => setSheetOpen(true)}
              className={tab(browse)}
            >
              <Indicator on={browse} />
              <GridIcon size={24} />
              دسته‌ها
            </button>
          </li>
          )}
          <li className="flex flex-1">
            <Link prefetch={false} href={routes.kit} aria-current={kit ? "page" : undefined} className={tab(kit)}>
              <Indicator on={kit} />
              <PackageIcon size={24} />
              بسته مطالعاتی
            </Link>
          </li>
          <li className="flex flex-1">
            <Link
              prefetch={false}
              href={routes.cart}
              aria-current={cart ? "page" : undefined}
              aria-label={count > 0 ? `سبد خرید، ${toPersianDigits(count)} کالا` : "سبد خرید"}
              className={tab(cart)}
            >
              <Indicator on={cart} />
              <span key={bump} className={`relative ${bump ? "motion-bump" : ""}`}>
                <CartIcon size={24} />
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -end-2.5 -top-1.5 grid min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-extrabold leading-[1.125rem] text-ink ring-2 ring-surface"
                  >
                    {toPersianDigits(count > 99 ? "99+" : count)}
                  </span>
                )}
              </span>
              <span aria-hidden="true">سبد</span>
            </Link>
          </li>
          <li className="flex flex-1">
            <Link prefetch={false} href={routes.account} aria-current={account ? "page" : undefined} className={tab(account)}>
              <Indicator on={account} />
              <UserIcon size={24} />
              حساب
            </Link>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setSheetOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setSheetOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) setSheetOpen(false);
        }}
        className={`${styles.sheet} rounded-t-card bg-surface p-0 text-ink shadow-raised backdrop:bg-[color-mix(in_srgb,var(--color-text)_60%,transparent)] md:hidden`}
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-1">
            <h2 id={titleId} className="text-base font-bold">
              دسته‌ها، آزمون‌ها و دروس
            </h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="-me-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-ink"
              aria-label="بستن"
            >
              <CloseIcon size={22} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {sheetOpen && <CategorySheet categories={categories} examTypes={examTypes} subjects={subjects} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
