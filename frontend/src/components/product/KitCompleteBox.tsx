"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { StudyKit } from "@/lib/types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { routes } from "@/lib/config";
import { SHORT_LABEL, isPurchasable } from "@/lib/variants";
import { kitRows, type KitRow as Row } from "./purchase-logic";
import { track } from "@/lib/analytics";
import { useCart } from "@/components/cart/CartProvider";
import { BookCover } from "@/components/book/BookCover";
import { CartIcon, CheckIcon } from "@/components/ui/Icons";
import { useSelectedVariant } from "./PurchasePanel";

/**
 * «کامل‌کردن بسته این درس» (research #5): this book + the other books of the same subject's study
 * kit, with checkboxes, the combined price and one «افزودن همه» via POST /cart/items/bulk/.
 */
export function KitCompleteBox({ kit, book }: { kit: StudyKit; book: Row["book"] }) {
  const uid = useId();
  const cart = useCart();
  const selected = useSelectedVariant();
  const others = kitRows(kit, book.id);
  const currentOk = selected != null && isPurchasable(selected);
  const rows: Row[] = [
    ...(currentOk ? [{ book, variant: selected, essential: true, current: true }] : []),
    ...others,
  ];
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "done"; ok: boolean; text: string }>({ kind: "idle" });

  if (others.length === 0) return null;

  const chosen = rows.filter((r) => !unchecked.has(r.book.id));
  const total = chosen.reduce((sum, r) => sum + r.variant.effective_price, 0);
  const toggle = (id: number) =>
    setUnchecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function addAll() {
    if (chosen.length === 0 || state.kind === "busy") return;
    setState({ kind: "busy" });
    const r = await cart.bulk(
      chosen.map((c) => ({ variant_id: c.variant.id, quantity: 1 })),
      "kit",
    );
    if (!r.ok) {
      setState({ kind: "done", ok: false, text: r.error.detail });
      return;
    }
    const { added, skipped } = r.result;
    track("add_to_cart", {
      source: "bundle_box",
      item_id: book.id,
      kit: `${kit.exam_type.slug}|${kit.subject.slug}`,
      quantity: added.length,
      value: chosen.filter((c) => added.includes(c.variant.id)).reduce((s, c) => s + c.variant.effective_price, 0),
    });
    setState({
      kind: "done",
      ok: added.length > 0,
      text:
        skipped.length === 0
          ? `${toPersianDigits(added.length)} کتاب به سبد خرید اضافه شد`
          : `${toPersianDigits(added.length)} کتاب اضافه شد؛ ${skipped.map((s) => s.detail).join(" ")}`,
    });
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
      <h2 id={`${uid}-title`} className="text-lg font-black text-ink">
        کامل‌کردن بسته این درس
      </h2>
      <p className="mt-1 text-sm leading-7 text-ink-muted">
        منابع بسته مطالعاتی {kit.subject.name} برای {kit.exam_type.name}؛ یک‌جا به سبد اضافه کنید.
      </p>

      <ul className="mt-4 divide-y divide-line">
        {rows.map((r) => {
          const checked = !unchecked.has(r.book.id);
          const labelId = `${uid}-b${r.book.id}`;
          return (
            <li key={r.book.id} className="flex items-center gap-3 py-2.5">
              <span className="relative grid size-11 shrink-0 place-items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(r.book.id)}
                  aria-labelledby={labelId}
                  className="peer size-6 cursor-pointer appearance-none rounded-md border-2 border-line-strong bg-surface checked:border-primary checked:bg-primary focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-focus"
                />
                <CheckIcon
                  size={16}
                  strokeWidth={3}
                  className="pointer-events-none absolute hidden text-white peer-checked:block"
                />
              </span>
              <span className="w-11 shrink-0" aria-hidden="true">
                <BookCover title={r.book.title} cover={r.book.cover} subjects={r.book.subjects} authors={r.book.authors} volumes={r.book.volumes} sizes="44px" />
              </span>
              <span className="min-w-0 flex-1">
                <span id={labelId} className="line-clamp-2 text-sm font-bold leading-6 text-ink">
                  {r.current ? (
                    <>
                      <span className="text-ink-muted">همین کتاب: </span>
                      {r.book.title}
                    </>
                  ) : (
                    <Link prefetch={false} href={routes.product(r.book.slug)} className="hover:text-primary hover:underline">
                      {r.book.title}
                    </Link>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span>{SHORT_LABEL[r.variant.type]}</span>
                  {!r.current && r.essential && <span className="font-bold text-success">ضروری</span>}
                </span>
              </span>
              <span className={`shrink-0 text-sm font-bold ${checked ? "text-ink" : "text-ink-muted line-through"}`}>
                {formatToman(r.variant.effective_price)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted" aria-live="polite">
          جمع {toPersianDigits(chosen.length)} کتاب: <span className="text-lg font-black text-ink">{formatToman(total)}</span>
        </p>
        <button
          type="button"
          onClick={() => void addAll()}
          aria-disabled={chosen.length === 0 || state.kind === "busy" || undefined}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-extrabold text-white hover:bg-primary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          <CartIcon size={18} />
          {state.kind === "busy" ? "در حال افزودن…" : chosen.length === rows.length ? "افزودن همه به سبد" : `افزودن ${toPersianDigits(chosen.length)} کتاب به سبد`}
        </button>
      </div>
      {state.kind === "done" && (
        <p role={state.ok ? "status" : "alert"} className={`mt-2 text-sm font-bold leading-7 ${state.ok ? "text-success" : "text-danger"}`}>
          {state.text}{" "}
          {state.ok && (
            <Link prefetch={false} href={routes.cart} className="underline underline-offset-4">
              مشاهده سبد
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
