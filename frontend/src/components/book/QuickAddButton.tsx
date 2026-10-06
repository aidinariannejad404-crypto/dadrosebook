"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { track } from "@/lib/analytics";
import { CartIcon, CheckIcon, PlusIcon } from "@/components/ui/Icons";

interface QuickAddButtonProps {
  variantId: number;
  bookId: number;
  bookTitle: string;
  /** effective price of the variant, for the analytics event */
  price: number | null;
  format: string | null;
  className?: string;
}

/**
 * «افزودن به سبد» icon button on in-stock cards (44px target). Uses the shared cart (toast and
 * live region come from <CartProvider>); errors are announced the same way. Sits on top of the
 * card's stretched title link (relative z-10) — never inside it.
 */
export function QuickAddButton({ variantId, bookId, bookTitle, price, format, className = "" }: QuickAddButtonProps) {
  const cart = useCart();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function add() {
    if (state === "busy") return;
    setState("busy");
    const r = await cart.add(variantId, 1, "card");
    if (r.ok) {
      setState("added");
      track("add_to_cart", { item_id: bookId, item_name: bookTitle, variant: format ?? undefined, value: price ?? undefined, quantity: 1 });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), 2500);
    } else {
      setState("idle");
      cart.announce(r.error.detail);
    }
  }

  const added = state === "added";
  return (
    <button
      type="button"
      onClick={add}
      aria-label={added ? `${bookTitle} به سبد خرید اضافه شد` : `افزودن ${bookTitle} به سبد خرید`}
      aria-busy={state === "busy" || undefined}
      className={`press relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${
        added ? "bg-success text-white" : "bg-primary text-white hover:bg-primary-hover"
      } disabled:opacity-60 ${className}`}
    >
      {added ? (
        <CheckIcon size={20} strokeWidth={2.6} />
      ) : (
        <span className="relative inline-flex">
          <CartIcon size={21} />
          <span className="absolute -end-1.5 -top-1.5 inline-flex size-[0.9rem] items-center justify-center rounded-full bg-accent text-ink ring-2 ring-primary">
            <PlusIcon size={10} strokeWidth={3.2} />
          </span>
        </span>
      )}
    </button>
  );
}
