import type { Variant, VariantType } from "./types";

/** Default format: PRINT if in stock, else EBOOK, else the first variant. */
export function defaultVariant(variants: Variant[]): Variant | undefined {
  const print = variants.find((v) => v.type === "PRINT");
  if (print?.in_stock) return print;
  const ebook = variants.find((v) => v.type === "EBOOK");
  if (ebook) return ebook;
  return variants[0];
}

export const DELIVERY_NOTE: Record<VariantType, string> = {
  PRINT: "ارسال با پست پیشتاز، تیپاکس یا پیک تهران",
  EBOOK: "دسترسی فوری در کتابخانه من، بلافاصله پس از پرداخت",
  BUNDLE: "همین حالا نسخه الکترونیک را بخوانید؛ نسخه چاپی برایتان ارسال می‌شود",
};

export const SHORT_LABEL: Record<VariantType, string> = {
  PRINT: "چاپی",
  EBOOK: "الکترونیک",
  BUNDLE: "چاپی + الکترونیک",
};

export function hasDiscount(v: Variant): boolean {
  return v.effective_price < v.price;
}
