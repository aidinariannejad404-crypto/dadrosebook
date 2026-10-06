"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { formatToman, toPersianDigits } from "@/lib/format";
import { useCart } from "@/components/cart/CartProvider";
import { CartIcon, CheckIcon } from "@/components/ui/Icons";

/** د۴ «افزودن به سبد» for one missing essential book. */
export function ReadinessAddButton({
  variantId,
  bookId,
  title,
  typeLabel,
  price,
}: {
  variantId: number;
  bookId: number;
  title: string;
  typeLabel: string;
  price: number;
}) {
  const cart = useCart();
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  async function add() {
    if (state !== "idle") return;
    setState("busy");
    const r = await cart.add(variantId, 1, "other");
    if (r.ok) {
      setState("added");
      track("readiness_add_to_cart", { item_id: bookId, item_name: title, value: price, quantity: 1 });
    } else {
      setState("idle");
      cart.announce(r.error.detail);
    }
  }
  if (state === "added") {
    return (
      <span className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-success">
        <CheckIcon size={16} strokeWidth={2.6} />
        در سبد خرید
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void add()}
      aria-disabled={state === "busy" || undefined}
      aria-label={`افزودن ${title} (${typeLabel}) به سبد خرید`}
      className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-control border-2 border-primary px-3 text-sm font-extrabold text-primary hover:bg-primary-soft aria-disabled:opacity-70"
    >
      <CartIcon size={16} className="shrink-0" />
      {state === "busy" ? "در حال افزودن…" : `${typeLabel} · ${formatToman(price)}`}
    </button>
  );
}

/** د۴ «افزودن همه منابع ضروری که ندارید» (one bulk call). */
export function AddMissingButton({ variantIds }: { variantIds: number[] }) {
  const cart = useCart();
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "done"; added: number } | { kind: "error"; text: string }>({
    kind: "idle",
  });
  if (variantIds.length === 0) return null;
  async function addAll() {
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    const r = await cart.bulk(
      variantIds.map((id) => ({ variant_id: id, quantity: 1 })),
      "other",
    );
    if (r.ok) {
      setState({ kind: "done", added: r.result.added.length });
      track("readiness_add_to_cart", { items: r.result.added.length, source: "add_missing" });
    } else setState({ kind: "error", text: r.error.detail });
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => void addAll()}
        aria-disabled={state.kind === "busy" || undefined}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover aria-disabled:opacity-70 sm:w-auto"
      >
        <CartIcon size={20} className="shrink-0" />
        {state.kind === "busy" ? "در حال افزودن…" : `افزودن ${toPersianDigits(variantIds.length)} منبع ضروری که ندارید`}
      </button>
      <p role="status" className="mt-2 text-sm font-bold empty:hidden">
        {state.kind === "done" && <span className="text-success">{toPersianDigits(state.added)} کتاب به سبد خرید اضافه شد.</span>}
        {state.kind === "error" && <span className="text-danger">{state.text}</span>}
      </p>
    </div>
  );
}
