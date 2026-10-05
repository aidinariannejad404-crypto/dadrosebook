"use client";

import Link from "next/link";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import type { BookCard, Course, StoreSettings, Variant, VariantType } from "@/lib/types";
import { formatNumber, formatPercent, formatToman, toPersianDigits } from "@/lib/format";
import {
  PRICE_SOON,
  SHORT_LABEL,
  defaultVariant,
  deliveryLines,
  hasDiscount,
  purchasableEbook,
} from "@/lib/variants";
import { courseLink } from "@/lib/courses";
import { track } from "@/lib/analytics";
import { routes } from "@/lib/config";
import * as cartClient from "@/lib/cart-client";
import { policyRoutes, RETURN_WINDOW_DAYS } from "@/lib/content/policies";
import { useCart } from "@/components/cart/CartProvider";
import { AddedToCartSheet, type AddedState, type SheetBook } from "./AddedToCartSheet";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { TrackedLink } from "@/components/ui/TrackedLink";
import {
  BoltIcon,
  BookOpenIcon,
  CartIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  ExternalIcon,
  PlayIcon,
  TruckIcon,
} from "@/components/ui/Icons";

interface PurchaseProviderProps {
  bookId: number;
  bookTitle: string;
  variants: Variant[];
  course?: Course;
  /** book slug for the course link's utm_content */
  bookSlug?: string;
  /** the page has a course cross-sell section (#courses): show a teaser link instead of the course add-on */
  courseTeaser?: boolean;
  /** short second line under the teaser, e.g. «جلسه اول رایگان · ۱۵٪ تخفیف دوره‌ها» */
  courseTeaserNote?: string | null;
  store?: StoreSettings | null;
  /** «۳۴ روز تا آزمون کانون وکلا ۱۴۰۵» (P1-6), rendered next to the price */
  examLine?: string | null;
  /** fewer than 14 days to the exam (P1-6) */
  lowTime?: boolean;
  /** the book as shown in the added-to-cart sheet */
  sheetBook?: SheetBook;
  /** a related book the sheet suggests when there is no format upgrade */
  related?: BookCard | null;
}

const DELIVERY_ICON: Record<VariantType, typeof TruckIcon> = {
  PRINT: TruckIcon,
  EBOOK: BoltIcon,
  BUNDLE: BookOpenIcon,
};

const PRICE_SOON_NOTE = "قیمت این نسخه به‌زودی اعلام می‌شود";

interface PurchaseState extends PurchaseProviderProps {
  selected: Variant | undefined;
  select: (id: number) => void;
  wantsCourse: boolean;
  setWantsCourse: (v: boolean) => void;
  ebook: Variant | undefined;
  printOut: boolean;
  add: AddState;
  addSelected: () => Promise<void>;
}

type AddState = { kind: "idle" } | { kind: "busy" } | { kind: "added"; variantId: number } | { kind: "error"; message: string };

const PurchaseContext = createContext<PurchaseState | null>(null);

function usePurchase(): PurchaseState {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error("PurchasePanel must be used inside <PurchaseProvider>");
  return ctx;
}

/** Shares the selected format between the buy box and the mobile sticky bar. */
export function PurchaseProvider({ children, ...props }: PurchaseProviderProps & { children: ReactNode }) {
  // A placeholder price is never the default; a sold-out print edition defaults to the ebook (P1-8, P1-17).
  const [selectedId, setSelectedId] = useState<number | undefined>(() => defaultVariant(props.variants)?.id);
  const [wantsCourse, setWantsCourse] = useState(false);
  const [add, setAdd] = useState<AddState>({ kind: "idle" });
  const [sheet, setSheet] = useState<AddedState | null>(null);
  const cart = useCart();
  const print = props.variants.find((v) => v.type === "PRINT");
  const selected = props.variants.find((v) => v.id === selectedId);

  async function addSelected() {
    if (!selected || selected.price_is_placeholder || !selected.in_stock || add.kind === "busy") return;
    setAdd({ kind: "busy" });
    // straight to the client (not cart.add): the sheet below replaces the global toast here
    const r = await cartClient.addToCart(selected.id, 1, "product");
    void cart.refresh();
    if (r.ok) {
      setAdd({ kind: "added", variantId: selected.id });
      if (props.sheetBook) setSheet({ variant: selected, cart: r.cart });
      else cart.announce("به سبد خرید اضافه شد");
      track("add_to_cart", {
        item_id: props.bookId,
        item_name: props.bookTitle,
        variant: selected.type,
        value: selected.effective_price,
        quantity: 1,
      });
    } else {
      setAdd({ kind: "error", message: r.error.detail });
    }
  }

  const value: PurchaseState = {
    ...props,
    selected,
    select: (id: number) => {
      setSelectedId(id);
      setAdd({ kind: "idle" });
    },
    add,
    addSelected,
    wantsCourse,
    setWantsCourse,
    ebook: purchasableEbook(props.variants),
    printOut: print != null && !print.in_stock,
  };
  return (
    <PurchaseContext.Provider value={value}>
      {children}
      {props.sheetBook && (
        <AddedToCartSheet state={sheet} onClose={() => setSheet(null)} book={props.sheetBook} related={props.related} />
      )}
    </PurchaseContext.Provider>
  );
}

/** The selected format, for boxes outside the buy panel (e.g. «کامل‌کردن بسته این درس»). */
export function useSelectedVariant(): Variant | undefined {
  return useContext(PurchaseContext)?.selected;
}

/** «پرداخت امن زرین‌پال · ارسال به سراسر کشور · بازگشت ۷ روزه» under the buy button. */
export function TrustLine({ className = "" }: { className?: string }) {
  const items = [
    { href: policyRoutes.faq, label: "پرداخت امن زرین‌پال", Icon: ShieldIcon },
    { href: policyRoutes.shipping, label: "ارسال به سراسر کشور", Icon: TruckIcon },
    { href: policyRoutes.returns, label: `بازگشت ${toPersianDigits(RETURN_WINDOW_DAYS)} روزه`, Icon: CheckIcon },
  ];
  return (
    <ul className={`flex flex-wrap items-center justify-center gap-x-3 text-xs text-ink-muted ${className}`} aria-label="خرید مطمئن">
      {items.map(({ href, label, Icon }) => (
        <li key={href}>
          <Link
            href={href}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 underline decoration-line-strong underline-offset-4 hover:text-primary hover:decoration-primary"
          >
            <Icon size={14} className="shrink-0 text-primary" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Primary action: add to cart (never for a placeholder price), «view cart» once added, or notify-me
 * when sold out. The full box also offers a quick buy straight to /checkout?variant=<id> (Phase 3;
 * «خرید و شروع مطالعه» for EBOOK/BUNDLE).
 */
function BuyAction({ compact, helperId }: { compact: boolean; helperId?: string }) {
  const { selected, variants, bookId, bookTitle, ebook, printOut, add, addSelected } = usePurchase();
  const soldOut = selected ? !selected.in_stock : printOut;
  if (soldOut) {
    const watched = selected ?? variants.find((v) => v.type === "PRINT");
    return (
      <NotifyMeButton
        bookId={bookId}
        bookTitle={bookTitle}
        variantId={watched?.id}
        variantType={watched?.type ?? "PRINT"}
        ebookAvailable={ebook != null}
        source="product"
        size={compact ? "sm" : "md"}
        className={compact ? "shrink-0" : "w-full"}
      />
    );
  }
  const size = compact ? "px-4 text-sm" : "w-full px-6 text-base";
  if (add.kind === "added" && add.variantId === selected?.id) {
    return (
      <Link
        href={routes.cart}
        prefetch={false}
        className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-control border-2 border-primary bg-surface font-extrabold text-primary hover:bg-primary-soft ${size}`}
      >
        <CartIcon size={20} />
        مشاهده سبد خرید
      </Link>
    );
  }
  const placeholder = !selected || selected.price_is_placeholder;
  if (placeholder) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={helperId}
        title={compact ? PRICE_SOON_NOTE : undefined}
        onClick={(e) => e.preventDefault()}
        className={`inline-flex min-h-12 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-control bg-primary font-extrabold text-white opacity-60 ${size}`}
      >
        <CartIcon size={20} />
        افزودن به سبد خرید
        {compact && <span className="sr-only">({PRICE_SOON_NOTE})</span>}
      </button>
    );
  }
  const busy = add.kind === "busy";
  const readNow = selected.type === "EBOOK" || selected.type === "BUNDLE";
  return (
    <>
      <button
        type="button"
        onClick={() => void addSelected()}
        aria-disabled={busy || undefined}
        className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-control bg-primary font-extrabold text-white hover:bg-primary-hover aria-disabled:opacity-80 ${size}`}
      >
        <CartIcon size={20} />
        {busy ? "در حال افزودن…" : "افزودن به سبد خرید"}
      </button>
      {!compact && (
        <Link
          prefetch={false}
          href={`${routes.checkout}?variant=${selected.id}`}
          onClick={() =>
            track("begin_checkout", {
              item_id: bookId,
              item_name: bookTitle,
              variant_id: selected.id,
              variant_type: selected.type,
              value: selected.effective_price,
              currency: "IRT",
              source: "quick_buy",
            })
          }
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary bg-surface px-6 text-sm font-extrabold text-primary hover:bg-primary-soft"
        >
          {readNow ? <BoltIcon size={18} /> : null}
          {readNow ? "خرید و شروع مطالعه" : "خرید سریع"}
        </Link>
      )}
    </>
  );
}

function tilePrice(v: Variant): { text: string; cls: string } {
  if (v.price_is_placeholder) return { text: PRICE_SOON, cls: "text-ink-muted" };
  if (!v.in_stock) return { text: "ناموجود", cls: "font-bold text-danger" };
  return { text: formatToman(v.effective_price), cls: "text-ink-muted" };
}

/**
 * Format switcher (native radio group: arrow keys, labels, form semantics), price/stock/delivery,
 * exam countdown, optional related-course add-on and the buy actions. `footer` renders at the end
 * of the box (e.g. the consult CTA).
 */
export function PurchasePanel({ footer }: { footer?: ReactNode }) {
  const uid = useId();
  const { bookSlug, courseTeaser, courseTeaserNote, variants, course, selected, select, wantsCourse, setWantsCourse, store, examLine, lowTime, ebook, printOut, add } =
    usePurchase();

  if (variants.length === 0) {
    return (
      <section className="rounded-card bg-surface p-4 shadow-card">
        <p className="font-bold text-ink-muted">این کتاب در حال حاضر برای فروش عرضه نشده است.</p>
        {footer && <div className="mt-4 border-t border-line pt-4">{footer}</div>}
      </section>
    );
  }

  const DeliveryIcon = DELIVERY_ICON[selected?.type ?? "PRINT"];
  const helperId = `${uid}-cart-helper`;
  const placeholder = !selected || selected.price_is_placeholder;
  const lowStock = selected?.stock != null && selected.stock > 0 && selected.stock <= 5;
  const ebookSelected = selected?.type === "EBOOK";
  const showPrintOut = printOut && ebook != null;
  const showLowTime = Boolean(lowTime) && ebook != null && !ebookSelected && !showPrintOut;
  const saving = selected?.type === "BUNDLE" && !placeholder ? selected.bundle_saving : null;

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-card bg-surface p-4 shadow-card md:p-5">
      <h2 id={`${uid}-title`} className="sr-only">
        خرید کتاب
      </h2>

      {showPrintOut && (
        <div className="mb-4 rounded-control bg-success-soft px-3 py-2.5 text-sm leading-7 text-success">
          <p className="font-bold">نسخه چاپی تمام شده — نسخه الکترونیک موجود است، همین الان شروع کنید.</p>
          {!ebookSelected && (
            <button
              type="button"
              onClick={() => select(ebook.id)}
              className="mt-1 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
            >
              انتخاب نسخه الکترونیک
            </button>
          )}
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink">نوع نسخه</legend>
        <div className={`grid gap-2 ${variants.length >= 3 ? "grid-cols-3" : variants.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {variants.map((v) => {
            const price = tilePrice(v);
            const checked = v.id === selected?.id;
            return (
              <label key={v.id} className="relative block cursor-pointer">
                <input
                  type="radio"
                  name={`${uid}-format`}
                  value={v.type}
                  checked={checked}
                  onChange={() => select(v.id)}
                  className="peer sr-only"
                />
                <span className="flex h-full min-h-16 flex-col items-center justify-center gap-0.5 rounded-control border-2 border-line bg-surface px-1.5 py-2 text-center transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-line-strong">
                  <span className="text-sm font-extrabold leading-6 text-ink">{SHORT_LABEL[v.type]}</span>
                  <span className={`text-xs ${price.cls}`}>{price.text}</span>
                  {v.bundle_saving != null && !v.price_is_placeholder && (
                    <span className="mt-0.5 text-[0.6875rem] font-bold leading-4 text-success">
                      {formatNumber(v.bundle_saving)} تومان صرفه‌جویی
                    </span>
                  )}
                </span>
                {checked && (
                  <span aria-hidden="true" className="absolute -top-1.5 end-1.5 grid size-5 place-items-center rounded-full bg-primary text-white">
                    <CheckIcon size={13} strokeWidth={3} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {showLowTime && (
        <button
          type="button"
          onClick={() => select(ebook.id)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-warning bg-warning-soft px-3 text-sm font-bold text-warning hover:brightness-95"
        >
          <BoltIcon size={18} className="shrink-0" />
          زمان کم است؟ نسخه الکترونیک را همین الان بخوانید
        </button>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-2" aria-live="polite">
        <div>
          <p className="text-xs text-ink-muted">{selected?.type_label ?? "قیمت"}</p>
          {selected && !placeholder && hasDiscount(selected) && (
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
          {selected && !placeholder ? (
            <p className="mt-0.5 text-2xl font-black text-ink">
              {hasDiscount(selected) && <span className="sr-only">قیمت با تخفیف: </span>}
              {formatToman(selected.effective_price)}
            </p>
          ) : (
            <p className="mt-0.5 text-xl font-black text-ink-muted">{PRICE_SOON}</p>
          )}
          {saving != null && (
            <p className="mt-1 text-xs font-bold text-success">
              {formatToman(saving)} صرفه‌جویی نسبت به خرید جداگانه
            </p>
          )}
        </div>
        {selected && !placeholder && (
          <p
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              selected.in_stock ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {selected.in_stock ? <CheckIcon size={14} strokeWidth={2.6} /> : null}
            {selected.in_stock ? (selected.type === "EBOOK" ? "قابل دسترسی فوری" : "موجود در انبار") : "ناموجود"}
          </p>
        )}
      </div>
      {lowStock && selected?.in_stock && !placeholder && (
        <p className="mt-2 text-xs font-bold text-danger">تنها {toPersianDigits(selected.stock ?? 0)} نسخه باقی مانده است</p>
      )}
      {examLine && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-primary">
          <ClockIcon size={16} className="shrink-0" />
          {examLine}
        </p>
      )}

      {selected && (
        <div className="mt-4 flex items-start gap-2 rounded-control bg-bg px-3 py-2.5 text-[0.8125rem] leading-6 text-ink">
          <DeliveryIcon size={20} className="mt-0.5 shrink-0 text-primary" />
          <ul className="space-y-0.5">
            {deliveryLines(selected.type, store).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {courseTeaser && (
        <a
          href="#courses"
          className="mt-4 flex min-h-11 items-center gap-2 rounded-control bg-primary-soft px-3 py-2 text-sm font-bold text-primary hover:bg-primary-tint"
        >
          <PlayIcon size={16} className="shrink-0" />
          <span className="flex-1">
            این درس را با دوره‌های دادرُز کامل کنید
            {courseTeaserNote && <span className="block text-xs font-medium text-ink-muted">{courseTeaserNote}</span>}
          </span>
          <span aria-hidden="true">↓</span>
        </a>
      )}

      {course && !courseTeaser && (
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
        {placeholder && !(selected ? !selected.in_stock : printOut) && (
          <p id={helperId} className="text-center text-xs text-ink-muted">
            {PRICE_SOON_NOTE}
          </p>
        )}
        {add.kind === "added" && add.variantId === selected?.id && (
          <p role="status" className="flex items-center justify-center gap-1.5 text-sm font-bold text-success">
            <CheckIcon size={16} strokeWidth={2.6} />
            {selected.type_label} به سبد خرید اضافه شد
          </p>
        )}
        {add.kind === "error" && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold leading-7 text-danger">
            {add.message}
          </p>
        )}
        <TrustLine />
        {course && wantsCourse && !courseTeaser && (
          <TrackedLink
            href={courseLink(course.url, bookSlug ?? "")}
            external
            course={{ course_id: course.id, course_title: course.title, book_slug: bookSlug ?? null, placement: "buy_box" }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            خرید دوره «{course.title}» در دادرُز
            <ExternalIcon size={18} />
            <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
          </TrackedLink>
        )}
      </div>
      {footer && <div className="mt-4 border-t border-line pt-4">{footer}</div>}
    </section>
  );
}

/**
 * Mobile sticky buy bar. Rendered as the last child of the product page wrapper with
 * position: sticky, so it follows the viewport but stops before the footer.
 */
export function StickyBuyBar() {
  const { selected, variants } = usePurchase();
  if (variants.length === 0) return null;
  const placeholder = !selected || selected.price_is_placeholder;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-line bg-surface shadow-raised pb-safe md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-muted">{selected?.type_label ?? "قیمت"}</p>
          <p className={`text-base font-black ${placeholder ? "text-ink-muted" : "text-ink"}`}>
            {placeholder ? PRICE_SOON : formatToman(selected.effective_price)}
          </p>
        </div>
        <BuyAction compact />
      </div>
    </div>
  );
}
