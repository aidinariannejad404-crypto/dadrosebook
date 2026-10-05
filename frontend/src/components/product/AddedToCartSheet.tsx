"use client";

import Link from "next/link";
import { useState } from "react";
import type { BookCard, Cart, PersonMini, SubjectMini, Variant } from "@/lib/types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { routes } from "@/lib/config";
import { SHORT_LABEL } from "@/lib/variants";
import { pickSuggestion } from "./purchase-logic";
import { track } from "@/lib/analytics";
import * as client from "@/lib/cart-client";
import { useCart } from "@/components/cart/CartProvider";
import { Dialog } from "@/components/ui/Dialog";
import { BookCover } from "@/components/book/BookCover";
import { BoltIcon, CartIcon, CheckIcon, TruckIcon } from "@/components/ui/Icons";

export interface SheetBook {
  id: number;
  title: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
  volumes: number;
  variants: Variant[];
}

export interface AddedState {
  variant: Variant;
  cart: Cart;
}

/**
 * «به سبد خرید اضافه شد» bottom sheet (phones) / dialog (desktop): the added item, cart total,
 * free-shipping progress, one suggestion and «ادامه خرید / مشاهده سبد». Focus trap, Esc and focus
 * return come from the native <dialog> in ui/Dialog.
 */
export function AddedToCartSheet({
  state,
  onClose,
  book,
  related,
}: {
  state: AddedState | null;
  onClose: () => void;
  book: SheetBook;
  related?: BookCard | null;
}) {
  const cartCtx = useCart();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // the sheet keeps showing the latest cart (after an upgrade) while open
  const [cartOverride, setCartOverride] = useState<Cart | null>(null);
  const [lastKey, setLastKey] = useState<AddedState | null>(null);
  if (state !== lastKey) {
    setLastKey(state);
    setCartOverride(null);
    setNote(null);
  }

  const open = state != null;
  const cart = cartOverride ?? state?.cart ?? null;
  const variant = state?.variant;
  const suggestion = variant && cart ? pickSuggestion(variant, book.variants, cart, related) : null;
  const threshold = cart?.free_shipping_threshold ?? null;
  const showShipping = Boolean(cart?.has_physical && threshold && threshold > 0);
  const progress = showShipping && cart && threshold ? Math.min(100, Math.round((cart.subtotal / threshold) * 100)) : 0;

  async function takeUpgrade(to: Variant) {
    if (!cart || !variant || busy) return;
    setBusy(true);
    setNote(null);
    // bundle replaces the print copy just added (the ebook is added alongside)
    let current = cart;
    if (to.type === "BUNDLE") {
      const line = cart.items.find((i) => i.variant.id === variant.id);
      if (line) {
        const r = line.quantity > 1 ? await client.updateQuantity(line.id, line.quantity - 1) : await client.removeItem(line.id);
        if (!r.ok) {
          setBusy(false);
          setNote({ ok: false, text: r.error.detail });
          return;
        }
        current = r.cart;
      }
    }
    const r = await client.addToCart(to.id, 1, "product");
    setBusy(false);
    if (r.ok) {
      current = r.cart;
      setNote({ ok: true, text: `${to.type_label} به سبد خرید اضافه شد` });
      track("add_to_cart", {
        item_id: book.id,
        item_name: book.title,
        variant: to.type,
        value: to.effective_price,
        quantity: 1,
        source: "sheet",
      });
    } else {
      setNote({ ok: false, text: r.error.detail });
    }
    setCartOverride(current);
    void cartCtx.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="به سبد خرید اضافه شد" placement="sheet">
      {variant && cart && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 shrink-0" aria-hidden="true">
              <BookCover title={book.title} cover={book.cover} subjects={book.subjects} authors={book.authors} volumes={book.volumes} sizes="56px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-bold leading-7 text-ink">{book.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                <span>{variant.type_label}</span>
                <span className="font-bold text-ink">{formatToman(variant.effective_price)}</span>
              </p>
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden="true">
              <CheckIcon size={18} strokeWidth={2.6} />
            </span>
          </div>

          <div className="rounded-control bg-bg p-3">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">جمع سبد ({toPersianDigits(cart.item_count)} کالا)</span>
              <span className="text-base font-black text-ink">{formatToman(cart.subtotal)}</span>
            </p>
            {showShipping && (
              <>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                  <TruckIcon size={18} className="shrink-0 text-primary" />
                  {cart.free_shipping_remaining
                    ? `${formatToman(cart.free_shipping_remaining)} تا ارسال رایگان`
                    : "ارسال این سفارش رایگان است"}
                </p>
                <div
                  role="progressbar"
                  aria-label="پیشرفت تا ارسال رایگان"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-line"
                >
                  <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>

          {suggestion && (suggestion.kind === "upgrade" || suggestion.kind === "ebook") && (
            <div className="rounded-control border-2 border-accent bg-accent-soft p-3">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                <BoltIcon size={18} className="shrink-0 text-primary" />
                {suggestion.kind === "upgrade" ? "همین حالا مطالعه را شروع کنید" : "نسخه الکترونیک را هم داشته باشید"}
              </p>
              <p className="mt-1 text-sm leading-7 text-ink">
                {suggestion.kind === "upgrade"
                  ? `با ${formatToman(suggestion.extra)} بیشتر، بسته «${SHORT_LABEL.BUNDLE}» را بگیرید: نسخه الکترونیک فوراً در کتابخانه شما و نسخه چاپی ارسال می‌شود.`
                  : `نسخه الکترونیک با ${formatToman(suggestion.to.effective_price)} بلافاصله پس از پرداخت در دسترس است.`}
              </p>
              <button
                type="button"
                onClick={() => void takeUpgrade(suggestion.to)}
                aria-disabled={busy || undefined}
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover aria-disabled:opacity-80"
              >
                {busy ? "در حال افزودن…" : suggestion.kind === "upgrade" ? "تبدیل به بسته چاپی + الکترونیک" : "افزودن نسخه الکترونیک"}
              </button>
            </div>
          )}

          {suggestion?.kind === "related" && (
            <div className="rounded-control border border-line p-3">
              <p className="text-xs font-bold text-ink-muted">داوطلبان این کتاب را هم خریدند</p>
              <Link
                href={routes.product(suggestion.book.slug)}
                prefetch={false}
                onClick={onClose}
                className="mt-2 flex min-h-11 items-center gap-3 rounded-control hover:bg-primary-soft"
              >
                <span className="w-10 shrink-0" aria-hidden="true">
                  <BookCover
                    title={suggestion.book.title}
                    cover={suggestion.book.cover}
                    subjects={suggestion.book.subjects}
                    authors={suggestion.book.authors}
                    sizes="40px"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-bold leading-6 text-ink">{suggestion.book.title}</span>
                  {suggestion.book.card_price != null && (
                    <span className="text-xs text-ink-muted">{formatToman(suggestion.book.card_price)}</span>
                  )}
                </span>
              </Link>
            </div>
          )}

          {note && (
            <p role={note.ok ? "status" : "alert"} className={`text-sm font-bold ${note.ok ? "text-success" : "text-danger"}`}>
              {note.text}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 items-center justify-center rounded-control border-2 border-primary bg-surface px-3 text-sm font-extrabold text-primary hover:bg-primary-soft"
            >
              ادامه خرید
            </button>
            <Link
              href={routes.cart}
              prefetch={false}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-3 text-sm font-extrabold text-white hover:bg-primary-hover"
            >
              <CartIcon size={18} />
              مشاهده سبد
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}
