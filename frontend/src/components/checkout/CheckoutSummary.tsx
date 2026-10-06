"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import type { Quote } from "@/lib/account-types";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { BoltIcon, TicketIcon } from "@/components/ui/Icons";
import { MiniCover } from "./MiniCover";

/** Order lines with cover, format, quantity, line total and per-line problems. */
export function OrderLines({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  const problemsByVariant = new Map(quote.problems.map((p) => [p.variant_id, p]));
  return (
    <ul className="divide-y divide-line">
      {quote.lines.map((l) => {
        const problem = problemsByVariant.get(l.variant_id);
        return (
          <li key={l.variant_id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            {!compact && <MiniCover title={l.title} cover={l.cover} subjectColor={l.subject_color} />}
            <div className="min-w-0 flex-1 text-sm leading-7">
              <Link href={routes.product(l.book_slug)} className="line-clamp-2 font-bold text-ink hover:text-primary">
                {l.title}
              </Link>
              <p className="text-ink-muted">
                {l.variant_type_label}، تعداد {toPersianDigits(l.quantity)}
              </p>
              {!compact && l.unit_price < l.list_price && (
                <p className="text-xs text-ink-muted">
                  <del>
                    <span className="sr-only">قیمت قبلی: </span>
                    {formatToman(l.list_price * l.quantity)}
                  </del>
                </p>
              )}
              {/* retention stream (ه۲): edition upgrade discount */}
              {l.upgrade_discount ? (
                <p className="text-xs font-bold text-success">
                  {l.upgrade_label}: {formatToman(l.upgrade_discount)}
                </p>
              ) : null}
              {problem && (
                <p className="mt-1 rounded-control bg-danger-soft px-2 py-1 text-xs font-bold leading-6 text-danger">{problem.message}</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-extrabold text-ink">{formatToman(l.line_total)}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** Problems whose variant is not among the lines (e.g. an inactive variant dropped by the server). */
export function OrphanProblems({ quote }: { quote: Quote }) {
  const ids = new Set(quote.lines.map((l) => l.variant_id));
  const orphans = quote.problems.filter((p) => !ids.has(p.variant_id));
  if (orphans.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
      {orphans.map((p) => (
        <li key={`${p.variant_id}-${p.code}`}>{p.message}</li>
      ))}
    </ul>
  );
}

/** Items, discount, shipping, total. */
export function Totals({ quote, showShipping }: { quote: Quote; showShipping: boolean }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-2">
        <dt className="text-ink-muted">جمع کالاها</dt>
        <dd className="font-bold text-ink">{formatToman(quote.items_total)}</dd>
      </div>
      {quote.discount && (
        <div className="flex justify-between gap-2 text-success">
          <dt>تخفیف ({quote.discount.label})</dt>
          <dd className="font-bold">− {formatToman(quote.discount.amount)}</dd>
        </div>
      )}
      {quote.needs_shipping && (
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">هزینه ارسال</dt>
          <dd className="font-bold text-ink">
            {!showShipping || !quote.shipping
              ? "پس از انتخاب روش ارسال"
              : quote.shipping_total === 0
                ? <span className="text-success">رایگان</span>
                : formatToman(quote.shipping_total)}
          </dd>
        </div>
      )}
      <div className="flex justify-between gap-2 border-t border-line pt-2 text-base">
        <dt className="font-extrabold text-ink">مبلغ قابل پرداخت</dt>
        <dd className="font-black text-ink">{formatToman(quote.total)}</dd>
      </div>
    </dl>
  );
}

export function FreeShippingHint({ quote }: { quote: Quote }) {
  if (!quote.needs_shipping || quote.free_shipping_remaining == null || quote.free_shipping_remaining <= 0) return null;
  return (
    <p className="rounded-control bg-info-soft px-3 py-2 text-sm leading-7 text-info">
      با {formatToman(quote.free_shipping_remaining)} خرید بیشتر، ارسال سفارش شما رایگان می‌شود.
    </p>
  );
}

export function EbookNowNote({ quote }: { quote: Quote }) {
  if (!quote.ebook_now) return null;
  return (
    <p className="flex items-start gap-2 rounded-control bg-success-soft px-3 py-2 text-sm leading-7 text-success">
      <BoltIcon size={18} className="mt-1 shrink-0" />
      نسخه الکترونیک بلافاصله پس از پرداخت در کتابخانه شما فعال می‌شود.
    </p>
  );
}

/** Discount code field: apply → parent re-quotes; the server's `discount_error` shows inline. */
export function DiscountField({
  applied,
  error,
  busy,
  onApply,
}: {
  applied: string | null;
  /** quote.discount_error for the applied code */
  error: string | null;
  busy: boolean;
  onApply: (code: string | null) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(applied ?? "");
  const accepted = applied && !error && !busy;

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    onApply(code || null);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${id}-code`} className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <TicketIcon size={18} className="text-primary" />
        کد تخفیف
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`${id}-code`}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-status`}
          className="block h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-base text-ink aria-[invalid=true]:border-danger"
        />
        {accepted ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              onApply(null);
            }}
            className="inline-flex min-h-12 shrink-0 items-center rounded-control border border-line-strong px-4 text-sm font-bold text-ink hover:bg-primary-soft"
          >
            حذف کد
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="inline-flex min-h-12 shrink-0 items-center rounded-control border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && applied ? "در حال بررسی…" : "اعمال"}
          </button>
        )}
      </div>
      <p id={`${id}-status`} aria-live="polite" className="mt-1.5 text-sm font-bold">
        {error ? <span className="text-danger">{error}</span> : accepted ? <span className="text-success">کد تخفیف اعمال شد.</span> : null}
      </p>
    </form>
  );
}
