/**
 * Ebook option facts (ج۷, the Fidibo pattern): price anchor against print, file format, pages,
 * «مناسب موبایل» for reflowable EPUB.
 */
import { formatNumber, formatPercent } from "./format";
import type { Variant } from "./types";

export type EbookFormat = "EPUB" | "PDF";

/** Whole percent the ebook is cheaper than print (≥ 1), or null when not comparable/cheaper. */
export function ebookSavingPercent(print: Variant | undefined, ebook: Variant | undefined): number | null {
  if (!print || !ebook || print.price_is_placeholder || ebook.price_is_placeholder) return null;
  const p = print.effective_price;
  const e = ebook.effective_price;
  if (!(p > 0) || !(e >= 0) || e >= p) return null;
  const pct = Math.floor((1 - e / p) * 100);
  return pct >= 1 ? pct : null;
}

export interface EbookFact {
  key: "saving" | "format" | "pages" | "mobile";
  text: string;
}

/** Ordered chips for the selected ebook option; empty facts are skipped. */
export function ebookFacts({
  saving,
  formats = [],
  pages = 0,
}: {
  saving: number | null;
  formats?: readonly string[];
  pages?: number | null;
}): EbookFact[] {
  const known = formats.filter((f): f is EbookFormat => f === "EPUB" || f === "PDF");
  const facts: EbookFact[] = [];
  if (saving != null) facts.push({ key: "saving", text: `${formatPercent(saving)} ارزان‌تر از نسخه چاپی` });
  if (known.length) facts.push({ key: "format", text: `فایل ${known.join(" و ")}` });
  if (pages && pages > 0) facts.push({ key: "pages", text: `${formatNumber(pages)} صفحه` });
  if (known.includes("EPUB")) facts.push({ key: "mobile", text: "مناسب موبایل" });
  return facts;
}
