"use client";

import Link from "next/link";
import { toPersianDigits } from "@/lib/format";
import { CartIcon } from "@/components/ui/Icons";
import { useBump } from "@/components/ui/useBump";
import { useCart } from "./CartProvider";

/** Header cart link with the live item count. */
export function CartBadge() {
  const { count, cart } = useCart();
  const bump = useBump(count, cart != null);
  return (
    <Link
      prefetch={false}
      href="/cart"
      aria-label={count > 0 ? `سبد خرید، ${toPersianDigits(count)} کالا` : "سبد خرید، خالی"}
      className="press relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-primary-soft"
    >
      <span key={bump} className={bump ? "motion-bump inline-flex" : "inline-flex"}>
        <CartIcon size={24} />
      </span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute end-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.6875rem] font-extrabold leading-5 text-ink"
        >
          {toPersianDigits(count > 99 ? "99+" : count)}
        </span>
      )}
    </Link>
  );
}
