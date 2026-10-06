"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BulkAddResult, Variant } from "@/lib/types";
import { trackSharedKitAdded } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { sharedVariant, type SharedKit, type SharedKitItem } from "@/lib/growth";
import { formatOptions } from "@/lib/kit";
import { SHORT_LABEL } from "@/lib/variants";
import { BookCover } from "@/components/book/BookCover";
import { CartIcon, CheckIcon, UsersIcon } from "@/components/ui/Icons";
import { useCart } from "@/components/cart/CartProvider";

type AddState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; result: BulkAddResult } | { kind: "error"; message: string };

/**
 * و۳: a kit someone shared (`/kit?k=…` or `/kit?exam=…&b=…`). Every buyable book is preselected in the
 * sharer's format; the recipient can drop books or switch formats and add everything with one tap.
 */
export function SharedKitView({ kit, via }: { kit: SharedKit; via: "token" | "slugs" }) {
  const { bulk } = useCart();
  const [picked, setPicked] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(kit.items.map((i) => [i.book.id, sharedVariant(i)?.id ?? null])),
  );
  const [add, setAdd] = useState<AddState>({ kind: "idle" });

  const lines = useMemo(
    () =>
      kit.items
        .map((i) => ({ item: i, variant: i.book.variants.find((v) => v.id === picked[i.book.id]) }))
        .filter((l): l is { item: SharedKitItem; variant: Variant } => Boolean(l.variant)),
    [kit.items, picked],
  );
  const total = lines.reduce((s, l) => s + l.variant.effective_price, 0);
  const original = lines.reduce((s, l) => s + l.variant.price, 0);

  async function addAll() {
    if (add.kind === "busy" || lines.length === 0) return;
    setAdd({ kind: "busy" });
    const r = await bulk(
      lines.map((l) => ({ variant_id: l.variant.id, quantity: 1 })),
      "kit",
    );
    if (!r.ok) {
      setAdd({ kind: "error", message: r.error.detail });
      return;
    }
    trackSharedKitAdded({ books: r.result.added.length, value: total, via });
    setAdd({ kind: "done", result: r.result });
  }

  const ownKit = kit.exam ? `/kit?exam=${encodeURIComponent(kit.exam.slug)}` : routes.kit;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem] lg:gap-6">
      <section aria-labelledby="shared-kit-title" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-ink">
          <UsersIcon size={16} />
          کیتی که برایتان فرستاده‌اند
        </p>
        <h1 id="shared-kit-title" className="mt-2 text-xl font-black text-ink md:text-2xl">
          کیت مطالعاتی {kit.exam ? `آزمون ${kit.exam.name}` : "پیشنهادی"}
        </h1>
        <p className="mt-1.5 leading-7 text-ink-muted">
          {toPersianDigits(kit.items.length)} کتاب با نسخه‌های انتخابی دوستتان آماده است. هر کدام را نخواستید بردارید و
          بقیه را یک‌جا به سبد اضافه کنید.
        </p>
        <ul className="mt-4 space-y-2">
          {kit.items.map((item) => {
            const book = item.book;
            const options = formatOptions(book.variants);
            const chosen = picked[book.id] ?? null;
            const buyable = options.some((v) => v.in_stock);
            const checkId = `sk-${book.id}`;
            return (
              <li key={book.id} className={`rounded-control border p-3 ${chosen ? "border-primary bg-primary-soft" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={chosen != null}
                    disabled={!buyable}
                    onChange={(e) => {
                      setAdd({ kind: "idle" });
                      setPicked((p) => ({ ...p, [book.id]: e.target.checked ? (sharedVariant(item)?.id ?? null) : null }));
                    }}
                    className="mt-3 size-5 shrink-0 accent-[var(--color-primary)]"
                  />
                  <div className="w-12 shrink-0">
                    <BookCover title={book.title} cover={book.cover} subjects={book.subjects} authors={book.authors} sizes="48px" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={checkId} className="flex min-h-11 cursor-pointer flex-col justify-center">
                      <span className="text-sm font-bold leading-6 text-ink">{book.title}</span>
                      {book.authors.length > 0 && (
                        <span className="text-xs text-ink-muted">{book.authors.map((a) => a.name).join("، ")}</span>
                      )}
                    </label>
                    <Link
                      href={routes.product(book.slug)}
                      className="inline-flex min-h-11 items-center text-xs font-bold text-primary underline-offset-4 hover:underline"
                    >
                      جزئیات کتاب
                    </Link>
                  </div>
                </div>
                {buyable ? (
                  <fieldset className="mt-2">
                    <legend className="sr-only">نوع نسخه «{book.title}»</legend>
                    <div className="grid grid-cols-3 gap-1.5">
                      {options.map((v) => (
                        <label key={v.id} className={v.in_stock ? "cursor-pointer" : "cursor-not-allowed"}>
                          <input
                            type="radio"
                            name={`sk-f-${book.id}`}
                            checked={chosen === v.id}
                            disabled={!v.in_stock}
                            onChange={() => {
                              setAdd({ kind: "idle" });
                              setPicked((p) => ({ ...p, [book.id]: v.id }));
                            }}
                            className="peer sr-only"
                          />
                          <span className="flex min-h-11 flex-col items-center justify-center rounded-control border border-line bg-surface px-1 py-1.5 text-center peer-checked:border-primary peer-checked:bg-primary-soft peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                            <span className="text-xs font-extrabold text-ink">{SHORT_LABEL[v.type]}</span>
                            <span className={`text-[0.6875rem] ${v.in_stock ? "text-ink-muted" : "font-bold text-danger"}`}>
                              {v.in_stock ? formatToman(v.effective_price) : "ناموجود"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="mt-2 text-xs font-bold text-ink-muted">این کتاب فعلاً قابل خرید نیست.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <aside aria-labelledby="shared-kit-summary" className="rounded-card bg-surface p-4 shadow-card md:p-5 lg:sticky lg:top-4">
        <h2 id="shared-kit-summary" className="text-base font-black text-ink">
          جمع کیت
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">تعداد کتاب</dt>
            <dd className="font-bold text-ink">{toPersianDigits(lines.length)}</dd>
          </div>
          {original > total && (
            <div className="flex justify-between gap-2 font-bold text-success">
              <dt>سود شما</dt>
              <dd>{formatToman(original - total)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-line pt-2 text-base font-black text-ink">
            <dt>مبلغ</dt>
            <dd>{formatToman(total)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={addAll}
          aria-disabled={lines.length === 0 || add.kind === "busy" || undefined}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary font-extrabold text-white hover:bg-primary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          <CartIcon size={20} />
          {add.kind === "busy" ? "در حال افزودن…" : "افزودن همه به سبد"}
        </button>
        <div aria-live="polite">
          {add.kind === "error" && (
            <p role="alert" className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
              {add.message}
            </p>
          )}
          {add.kind === "done" && (
            <div className="mt-3 rounded-control bg-success-soft px-3 py-3 text-sm leading-7 text-success">
              <p className="flex items-center gap-1.5 font-bold">
                <CheckIcon size={18} strokeWidth={2.6} />
                {toPersianDigits(add.result.added.length)} کتاب به سبد خرید اضافه شد
              </p>
              <Link
                href={routes.cart}
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover"
              >
                مشاهده سبد خرید
              </Link>
            </div>
          )}
        </div>
        <Link
          href={ownKit}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line-strong px-4 text-sm font-bold text-ink hover:bg-bg"
        >
          ساخت کیت خودم
        </Link>
      </aside>
    </div>
  );
}
