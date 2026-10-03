"use client";

import Link from "next/link";
import { toPersianDigits } from "@/lib/format";
import { CartIcon } from "@/components/ui/Icons";
import { useCart } from "./CartProvider";

/** Header cart link with the live item count. */
export function CartBadge() {
  const { count } = useCart();
  return (
    <Link
      prefetch={false}
      href="/cart"
      aria-label={count > 0 ? `سبد خرید، ${toPersianDigits(count)} کالا` : "سبد خرید، خالی"}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-primary-soft"
    >
      <CartIcon size={24} />
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
