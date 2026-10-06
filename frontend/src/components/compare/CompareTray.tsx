"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPARE_MAX, COMPARE_MIN, compareHref } from "@/lib/compare";
import { toPersianDigits } from "@/lib/format";
import { CompareIcon } from "./CompareToggle";
import { useCompareTray } from "./compare-store";

const HIDDEN_PREFIXES = ["/compare", "/checkout", "/read", "/cart", "/login", "/account"];

/**
 * Floating compare bar (د۶): appears once a book is picked, sits above the mobile tab bar
 * (data-bottom-nav lifts sticky bars by --bottom-nav-h when present).
 */
export function CompareTray() {
  const pathname = usePathname() ?? "/";
  const { items, toggle, clear } = useCompareTray();
  if (items.length === 0 || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const ready = items.length >= COMPARE_MIN;
  // phones: above the tab bar, and above the sticky buy bar on product / kit pages
  const lifted = pathname.startsWith("/product/") || pathname === "/kit";

  return (
    <aside
      aria-label="مقایسه کتاب‌ها"
      className={`motion-pop-in fixed inset-x-2 z-40 mx-auto max-w-xl rounded-card border border-line bg-surface p-2 shadow-raised md:bottom-4 ${
        lifted ? "bottom-[calc(8.25rem+env(safe-area-inset-bottom))]" : "bottom-[calc(4rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="flex items-center gap-2">
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {items.map((i) => (
            <li key={i.id} className="flex min-w-0 max-w-[9.5rem] shrink-0 items-center rounded-full bg-primary-soft ps-3 text-xs font-bold text-ink">
              <span className="truncate">{i.title}</span>
              <button
                type="button"
                onClick={() => toggle(i, false)}
                aria-label={`برداشتن «${i.title}» از مقایسه`}
                className="press grid size-11 shrink-0 place-items-center rounded-full text-base text-ink-muted hover:text-danger"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        {ready ? (
          <Link
            href={compareHref(items.map((i) => i.slug))}
            prefetch={false}
            className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-primary px-3 text-sm font-extrabold text-white hover:bg-primary-hover"
          >
            <CompareIcon size={18} />
            مقایسه ({toPersianDigits(items.length)})
          </Link>
        ) : (
          <span className="shrink-0 px-1 text-xs leading-5 text-ink-muted">
            یک کتاب دیگر
            <br />
            انتخاب کنید
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-1 text-[0.6875rem] text-ink-muted">
        <span>
          {toPersianDigits(items.length)} از {toPersianDigits(COMPARE_MAX)} کتاب
        </span>
        <button type="button" onClick={clear} className="inline-flex min-h-8 items-center px-1 font-bold underline underline-offset-4 hover:text-danger">
          پاک کردن
        </button>
      </div>
    </aside>
  );
}
