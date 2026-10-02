"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import type { Course, Variant, VariantType } from "@/lib/types";
import { formatPercent, formatToman, toPersianDigits } from "@/lib/format";
import { DELIVERY_NOTE, SHORT_LABEL, defaultVariant, hasDiscount } from "@/lib/variants";
import { withCourseUtm } from "@/lib/config";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { BoltIcon, BookOpenIcon, CartIcon, CheckIcon, ExternalIcon, TruckIcon } from "@/components/ui/Icons";

interface PurchasePanelProps {
  bookId: number;
  bookTitle: string;
  variants: Variant[];
  course?: Course;
}

const DELIVERY_ICON: Record<VariantType, typeof TruckIcon> = {
  PRINT: TruckIcon,
  EBOOK: BoltIcon,
  BUNDLE: BookOpenIcon,
};

const CART_SOON = "سبد خرید به‌زودی فعال می‌شود";

interface PurchaseState {
  bookId: number;
  bookTitle: string;
  variants: Variant[];
  course?: Course;
  selected: Variant | undefined;
  select: (id: number) => void;
  wantsCourse: boolean;
  setWantsCourse: (v: boolean) => void;
  ebookAvailable: boolean;
}

const PurchaseContext = createContext<PurchaseState | null>(null);

function usePurchase(): PurchaseState {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error("PurchasePanel must be used inside <PurchaseProvider>");
  return ctx;
}

/** Shares the selected format between the buy box and the mobile sticky bar. */
export function PurchaseProvider({ children, ...props }: PurchasePanelProps & { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<number | undefined>(() => defaultVariant(props.variants)?.id);
  const [wantsCourse, setWantsCourse] = useState(false);
  const selected = props.variants.find((v) => v.id === selectedId) ?? props.variants[0];
  const value: PurchaseState = {
    ...props,
    selected,
    select: setSelectedId,
    wantsCourse,
    setWantsCourse,
    ebookAvailable: props.variants.some((v) => v.type === "EBOOK" && v.in_stock),
  };
  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

/** Primary action: aria-disabled add-to-cart (cart arrives in Phase 2) or the honest notify-me dialog. */
function BuyAction({ compact, helperId }: { compact: boolean; helperId?: string }) {
  const { selected, bookId, bookTitle, ebookAvailable } = usePurchase();
  if (!selected) return null;
  if (!selected.in_stock) {
    return (
      <NotifyMeButton
        bookId={bookId}
        bookTitle={bookTitle}
        variantType={selected.type}
        ebookAvailable={ebookAvailable}
        size={compact ? "sm" : "md"}
        className={compact ? "shrink-0" : "w-full"}
      />
    );
  }
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-describedby={helperId}
      title={compact ? CART_SOON : undefined}
      onClick={(e) => e.preventDefault()}
      className={`inline-flex min-h-12 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-control bg-primary font-extrabold text-white opacity-80 ${
        compact ? "px-4 text-sm" : "w-full px-6 text-base"
      }`}
    >
      <CartIcon size={20} />
      افزودن به سبد خرید
      {compact && <span className="sr-only">({CART_SOON})</span>}
    </button>
  );
}

/**
 * Format switcher (native radio group: arrow keys, labels, form semantics), price/stock/delivery,
 * optional related-course add-on and the buy actions.
 */
export function PurchasePanel() {
  const uid = useId();
  const { bookId, variants, course, selected, select, wantsCourse, setWantsCourse } = usePurchase();

  if (!selected) {
    return (
      <section className="rounded-card bg-surface p-4 shadow-card">
        <p className="font-bold text-ink-muted">این کتاب در حال حاضر برای فروش عرضه نشده است.</p>
      </section>
    );
  }

  const DeliveryIcon = DELIVERY_ICON[selected.type];
  const helperId = `${uid}-cart-helper`;
  const priceId = `${uid}-price`;
  const lowStock = selected.stock != null && selected.stock > 0 && selected.stock <= 5;

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <h2 id={`${uid}-title`} className="sr-only">
          خرید کتاب
        </h2>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-ink">نوع نسخه</legend>
          <div className={`grid gap-2 ${variants.length >= 3 ? "grid-cols-3" : variants.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {variants.map((v) => (
              <label key={v.id} className="relative block cursor-pointer">
                <input
                  type="radio"
                  name={`${uid}-format`}
                  value={v.type}
                  checked={v.id === selected.id}
                  onChange={() => select(v.id)}
                  className="peer sr-only"
                />
                <span className="flex h-full min-h-16 flex-col items-center justify-center gap-0.5 rounded-control border-2 border-line bg-surface px-1.5 py-2 text-center transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-line-strong">
                  <span className="text-sm font-extrabold leading-6 text-ink">{SHORT_LABEL[v.type]}</span>
                  <span className={`text-xs ${v.in_stock ? "text-ink-muted" : "font-bold text-danger"}`}>
                    {v.in_stock ? formatToman(v.effective_price) : "ناموجود"}
                  </span>
                </span>
                {v.id === selected.id && (
                  <span aria-hidden="true" className="absolute -top-1.5 end-1.5 grid size-5 place-items-center rounded-full bg-primary text-white">
                    <CheckIcon size={13} strokeWidth={3} />
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-2" id={priceId} aria-live="polite">
          <div>
            <p className="text-xs text-ink-muted">{selected.type_label}</p>
            {hasDiscount(selected) && (
              <p className="mt-1 flex items-center gap-2">
                <del className="text-sm text-ink-muted">
                  <span className="sr-only">قیمت قبلی: </span>
                  {formatToman(selected.price)}
                </del>
                <span className="rounded-md bg-danger px-1.5 py-0.5 text-xs font-extrabold text-white">
                  {formatPercent(selected.discount_percent)} تخفیف
                </span>
              </p>
            )}
            <p className="mt-0.5 text-2xl font-black text-ink">
              {hasDiscount(selected) && <span className="sr-only">قیمت با تخفیف: </span>}
              {formatToman(selected.effective_price)}
            </p>
          </div>
          <p
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              selected.in_stock ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {selected.in_stock ? <CheckIcon size={14} strokeWidth={2.6} /> : null}
            {selected.in_stock ? (selected.type === "EBOOK" ? "قابل دسترسی فوری" : "موجود در انبار") : "ناموجود"}
          </p>
        </div>
        {lowStock && selected.in_stock && (
          <p className="mt-2 text-xs font-bold text-danger">تنها {toPersianDigits(selected.stock ?? 0)} نسخه باقی مانده است</p>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-control bg-bg px-3 py-2.5 text-sm leading-7 text-ink">
          <DeliveryIcon size={20} className="mt-1 shrink-0 text-primary" />
          {DELIVERY_NOTE[selected.type]}
        </p>

        {course && (
          <div className="mt-4 rounded-control border border-line p-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={wantsCourse}
                onChange={(e) => setWantsCourse(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
                aria-describedby={`${uid}-course-note`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">دوره مرتبط دادرُز را هم می‌خواهم</span>
                <span className="mt-0.5 block text-sm text-ink">
                  {course.title} — <span className="font-bold">{formatToman(course.price)}</span>
                </span>
                <span id={`${uid}-course-note`} className="mt-0.5 block text-xs leading-6 text-ink-muted">
                  دوره در سایت dadrose.com ارائه می‌شود و خرید آن جداگانه در همان سایت انجام می‌شود.
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <BuyAction compact={false} helperId={helperId} />
          {selected.in_stock && (
            <p id={helperId} className="text-center text-xs text-ink-muted">
              {CART_SOON}
            </p>
          )}
          {course && wantsCourse && (
            <TrackedLink
              href={withCourseUtm(course.url, "product_course")}
              external
              event="course_cross_sell_click"
              params={{ course_id: course.id, course_name: course.title, item_id: bookId, placement: "product" }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary-soft"
            >
              خرید دوره «{course.title}» در دادرُز
              <ExternalIcon size={18} />
              <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
            </TrackedLink>
          )}
        </div>
    </section>
  );
}

/**
 * Mobile sticky buy bar. Rendered as the last child of the product page wrapper with
 * position: sticky, so it follows the viewport but stops before the footer.
 */
export function StickyBuyBar() {
  const { selected } = usePurchase();
  if (!selected) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-line bg-surface shadow-raised pb-safe md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-muted">{selected.type_label}</p>
          <p className="text-base font-black text-ink">{formatToman(selected.effective_price)}</p>
        </div>
        <BuyAction compact />
      </div>
    </div>
  );
}
