"use client";

import Link from "next/link";
import { useState } from "react";
import type { Cart, CartIssue, CartItem } from "@/lib/types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { routes } from "@/lib/config";
import { track } from "@/lib/analytics";
import { SHORT_LABEL } from "@/lib/variants";
import { BookCover } from "@/components/book/BookCover";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { BoltIcon, BookOpenIcon, CartIcon, TruckIcon } from "@/components/ui/Icons";
import { useCart } from "./CartProvider";
// د۱ (impl/trust): warn when the customer already owns this format
import { DuplicateNotice } from "@/components/trust/DuplicateNotice";

const BESTSELLERS = routes.search({ ordering: "-sales_count" });

function issueText(item: CartItem): string {
  const messages: Record<CartIssue, string> = {
    out_of_stock: "این نسخه ناموجود شد. برای ادامه خرید آن را حذف کنید.",
    insufficient_stock: `تنها ${toPersianDigits(item.max_quantity)} نسخه موجود است؛ تعداد را کم کنید.`,
    unavailable: "این کالا دیگر عرضه نمی‌شود. برای ادامه خرید آن را حذف کنید.",
    price_unavailable: "قیمت این نسخه در حال بازبینی است. برای ادامه خرید آن را حذف کنید.",
  };
  return item.issue ? messages[item.issue] : "";
}

/** Cart page body: lines, summary card, mobile sticky total, empty state. */
export function CartView() {
  const { cart } = useCart();

  if (!cart) {
    return (
      <div aria-busy="true" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <span className="sr-only">در حال بارگذاری سبد خرید…</span>
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (cart.items.length === 0) return <EmptyCart />;

  const hasEbook = cart.items.some((i) => i.variant.type !== "PRINT");
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem] lg:gap-6">
      <section aria-labelledby="cart-lines" className="min-w-0">
        <h2 id="cart-lines" className="sr-only">
          کالاهای سبد
        </h2>
        <ul className="space-y-3">
          {cart.items.map((item) => (
            <CartLine key={item.id} item={item} />
          ))}
        </ul>
        {hasEbook && (
          <p className="mt-3 flex items-start gap-2 rounded-control bg-success-soft px-3 py-2.5 text-sm leading-7 text-success">
            <BoltIcon size={18} className="mt-1 shrink-0" />
            نسخه الکترونیک بلافاصله پس از پرداخت در کتابخانه شما
          </p>
        )}
      </section>
      <Summary cart={cart} />
      <StickyTotal cart={cart} />
    </div>
  );
}

function EmptyCart() {
  return (
    <section className="mx-auto max-w-lg rounded-card bg-surface px-5 py-10 text-center shadow-card">
      <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        <CartIcon size={32} />
      </span>
      <h2 className="mt-4 text-lg font-black text-ink">سبد خرید شما خالی است</h2>
      <p className="mt-2 leading-7 text-ink-muted">
        منابع آزمونتان را یک‌جا انتخاب کنید یا از پرفروش‌ترین کتاب‌ها شروع کنید.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={routes.kit}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
        >
          <BookOpenIcon size={20} />
          ساخت کیت مطالعاتی
        </Link>
        <Link
          href={BESTSELLERS}
          className="inline-flex min-h-12 items-center justify-center rounded-control border border-line-strong px-5 font-bold text-ink hover:bg-primary-soft"
        >
          پرفروش‌ترین کتاب‌ها
        </Link>
      </div>
    </section>
  );
}

function CartLine({ item }: { item: CartItem }) {
  const { update, remove } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = item.variant;
  const onSale = v.price > item.unit_price;
  const physical = v.type !== "EBOOK";
  const label = `«${item.book.title}» (${SHORT_LABEL[v.type]})`;

  async function run(action: () => ReturnType<typeof update>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await action();
    if (!r.ok) setError(r.error.detail);
    setBusy(false);
  }

  return (
    <li className={`rounded-card bg-surface p-3 shadow-card sm:p-4 ${item.is_available ? "" : "ring-1 ring-danger"}`} aria-busy={busy || undefined}>
      <div className="flex gap-3 sm:items-center sm:gap-4">
        <div className="w-16 shrink-0 sm:w-20">
          <BookCover title={item.book.title} cover={item.book.cover} subjects={item.book.subjects} authors={item.book.authors} sizes="80px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold leading-6 text-ink sm:text-base">
              <Link href={routes.product(item.book.slug)} className="hover:text-primary hover:underline">
                {item.book.title}
              </Link>
            </h3>
            <button
              type="button"
              onClick={() => void run(() => remove(item.id))}
              disabled={busy}
              aria-label={`حذف ${label} از سبد`}
              className="-me-2 -mt-2 inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              حذف
            </button>
          </div>
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            {v.type === "EBOOK" ? <BoltIcon size={14} /> : <TruckIcon size={14} />}
            {v.type_label}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
            {onSale && (
              <del className="text-xs text-ink-muted">
                <span className="sr-only">قیمت قبلی: </span>
                {formatToman(v.price)}
              </del>
            )}
            <span className="font-bold text-ink">
              <span className="sr-only">قیمت واحد: </span>
              {formatToman(item.unit_price)}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {physical ? (
              <div className="flex items-center gap-1" role="group" aria-label={`تعداد ${label}`}>
                <button
                  type="button"
                  onClick={() => void run(() => update(item.id, item.quantity - 1))}
                  disabled={busy || item.quantity <= 1}
                  aria-label={`کم کردن یک نسخه از ${label}`}
                  className="grid size-11 place-items-center rounded-control border border-line-strong text-xl font-bold text-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <output aria-live="polite" className="min-w-8 text-center text-base font-extrabold text-ink">
                  {toPersianDigits(item.quantity)}
                </output>
                <button
                  type="button"
                  onClick={() => void run(() => update(item.id, item.quantity + 1))}
                  disabled={busy || item.quantity >= item.max_quantity}
                  aria-label={`افزودن یک نسخه از ${label}`}
                  className="grid size-11 place-items-center rounded-control border border-line-strong text-xl font-bold text-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>
            ) : (
              <span className="inline-flex min-h-11 items-center text-sm font-bold text-ink-muted">{toPersianDigits(1)} نسخه</span>
            )}
            <p className="text-base font-black text-ink">
              <span className="sr-only">جمع این ردیف: </span>
              {formatToman(item.line_total)}
            </p>
          </div>
        </div>
      </div>

      <DuplicateNotice bookId={item.book.id} type={v.type} className="mt-3" />

      {item.issue && (
        <div className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm leading-7 text-danger">
          <p className="font-bold">{issueText(item)}</p>
          {item.issue === "out_of_stock" && physical && (
            <NotifyMeButton
              bookId={item.book.id}
              bookTitle={item.book.title}
              variantId={v.id}
              variantType={v.type}
              source="cart"
              size="sm"
              className="mt-2"
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function CheckoutButton({ cart, className = "" }: { cart: Cart; className?: string }) {
  if (cart.has_issues) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby="cart-issues-note"
        className={`inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-control bg-primary px-5 font-extrabold text-white opacity-60 ${className}`}
      >
        ادامه فرآیند خرید
      </button>
    );
  }
  return (
    <Link
      href="/checkout"
      prefetch={false}
      onClick={() => track("begin_checkout", { value: cart.subtotal, items: cart.item_count })}
      className={`inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover ${className}`}
    >
      ادامه فرآیند خرید
    </Link>
  );
}

function Summary({ cart }: { cart: Cart }) {
  const threshold = cart.free_shipping_threshold;
  const showShipping = cart.has_physical && threshold != null && threshold > 0;
  const progress = showShipping ? Math.min(100, Math.round((cart.subtotal / threshold) * 100)) : 0;
  return (
    <aside aria-labelledby="cart-summary" className="rounded-card bg-surface p-4 shadow-card lg:sticky lg:top-4 md:p-5">
      <h2 id="cart-summary" className="text-base font-black text-ink">
        خلاصه سفارش
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">قیمت کالاها ({toPersianDigits(cart.item_count)})</dt>
          <dd className="text-ink">{formatToman(cart.original_subtotal)}</dd>
        </div>
        {cart.savings > 0 && (
          <div className="flex justify-between gap-2 font-bold text-success">
            <dt>سود شما از این خرید</dt>
            <dd>{formatToman(cart.savings)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-line pt-2 text-base font-black text-ink">
          <dt>جمع سبد خرید</dt>
          <dd>{formatToman(cart.subtotal)}</dd>
        </div>
      </dl>
      {cart.has_physical && <p className="mt-2 text-xs leading-6 text-ink-muted">هزینه ارسال در مرحله بعد محاسبه می‌شود.</p>}

      {showShipping && (
        <div className="mt-4 rounded-control bg-bg p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
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
        </div>
      )}

      {cart.has_issues && (
        <p id="cart-issues-note" className="mt-4 text-sm font-bold leading-7 text-danger">
          برای ادامه، کالاهای ناموجود را حذف یا تعدادشان را اصلاح کنید.
        </p>
      )}
      <CheckoutButton cart={cart} className="mt-4 hidden w-full md:flex" />
    </aside>
  );
}

function StickyTotal({ cart }: { cart: Cart }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-surface shadow-raised pb-safe md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">جمع سبد خرید</p>
          <p className="text-base font-black text-ink">{formatToman(cart.subtotal)}</p>
        </div>
        <CheckoutButton cart={cart} className="shrink-0 text-sm" />
      </div>
    </div>
  );
}
