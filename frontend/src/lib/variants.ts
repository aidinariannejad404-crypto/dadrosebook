import type { StoreSettings, Variant, VariantType } from "./types";
import { formatToman } from "./format";

/** Placeholder prices are never sold (P1-17). */
export function isSellable(v: Variant): boolean {
  return !v.price_is_placeholder;
}

/** Can be added to the cart right now: real price and in stock. */
export function isPurchasable(v: Variant): boolean {
  return isSellable(v) && v.in_stock;
}

/**
 * Default format: the first purchasable of PRINT, EBOOK, BUNDLE (so a sold-out print edition
 * auto-selects the ebook, P1-8); else the first variant with a real price (e.g. sold-out print →
 * notify me). A placeholder-priced variant is never the default.
 */
export function defaultVariant(variants: Variant[]): Variant | undefined {
  for (const type of ["PRINT", "EBOOK", "BUNDLE"] as const) {
    const v = variants.find((x) => x.type === type && isPurchasable(x));
    if (v) return v;
  }
  return variants.find(isSellable);
}

/** The ebook a visitor short on time can start reading right now (P1-6, P1-8). */
export function purchasableEbook(variants: Variant[]): Variant | undefined {
  return variants.find((v) => v.type === "EBOOK" && isPurchasable(v));
}

export const DELIVERY_NOTE: Record<VariantType, string> = {
  PRINT: "ارسال با پست پیشتاز، تیپاکس یا پیک تهران",
  EBOOK: "دسترسی فوری در کتابخانه من، بلافاصله پس از پرداخت",
  BUNDLE: "همین حالا نسخه الکترونیک را بخوانید؛ نسخه چاپی برایتان ارسال می‌شود",
};

/**
 * Delivery promise lines for a format (P1-6). PRINT/BUNDLE use the store settings when present
 * (dispatch, Tehran, provinces, free shipping — one line each), falling back to the generic note.
 */
export function deliveryLines(type: VariantType, store: StoreSettings | null | undefined): string[] {
  if (type === "EBOOK") return [DELIVERY_NOTE.EBOOK];
  const lines: string[] = [];
  if (type === "BUNDLE") lines.push("نسخه الکترونیک همین حالا در دسترس است");
  const ship = [store?.print_dispatch_note, store?.delivery_tehran_note, store?.delivery_province_note]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (ship.length > 0) lines.push(...ship);
  else lines.push(type === "BUNDLE" ? DELIVERY_NOTE.BUNDLE : DELIVERY_NOTE.PRINT);
  if (store?.free_shipping_threshold) {
    lines.push(`ارسال رایگان برای سفارش‌های بالای ${formatToman(store.free_shipping_threshold)}`);
  }
  return lines;
}

export const SHORT_LABEL: Record<VariantType, string> = {
  PRINT: "چاپی",
  EBOOK: "الکترونیک",
  BUNDLE: "چاپی + الکترونیک",
};

export const PRICE_SOON = "قیمت به‌زودی";

export function hasDiscount(v: Variant): boolean {
  return v.effective_price < v.price;
}

/**
 * Qualifier shown next to a card's price. Cards show `card_price`, which is the PRINT price when a
 * print edition exists (shown plainly — no "از"), otherwise the cheapest format, which is labelled.
 */
export function cardPriceLabel(format: VariantType | null): string | null {
  if (format === "EBOOK") return "نسخه الکترونیک";
  if (format === "BUNDLE") return "بسته چاپی + الکترونیک";
  return null;
}

/** Card stock line (P1-8): a sold-out print edition is not a dead end when the ebook is available. */
export function cardStockNote(book: {
  formats: VariantType[];
  print_in_stock: boolean;
  in_stock: boolean;
}): string | null {
  const printOut = book.formats.includes("PRINT") && !book.print_in_stock;
  if (!printOut) return null;
  if (book.formats.includes("EBOOK") && book.in_stock) return "چاپی ناموجود · الکترونیک موجود";
  return null;
}
