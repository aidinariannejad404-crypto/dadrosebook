import type { BookDetail } from "./types";
import { toPersianDigits } from "./format";
import { stripHtml } from "./jsonld";
import { isSellable } from "./variants";

/**
 * P1-15 product <title> (the layout template appends « | کتاب دادرُز»):
 * «خرید کتاب {title} {first author} — ویرایش {publish_year}», omitting missing parts.
 */
export function productTitle(book: Pick<BookDetail, "title" | "authors" | "publish_year">): string {
  const author = book.authors[0]?.name;
  const head = ["خرید کتاب", book.title.trim(), author?.trim()].filter(Boolean).join(" ");
  return book.publish_year ? `${head} — ویرایش ${toPersianDigits(book.publish_year)}` : head;
}

/** Which formats are actually for sale (real price): "نسخه چاپی و الکترونیک" / "نسخه چاپی" / "نسخه الکترونیک". */
export function formatsClaim(book: Pick<BookDetail, "variants">): string | null {
  const sellable = book.variants.filter(isSellable);
  const print = sellable.some((v) => v.type === "PRINT" || v.type === "BUNDLE");
  const ebook = sellable.some((v) => v.type === "EBOOK" || v.type === "BUNDLE");
  if (print && ebook) return "نسخه چاپی و الکترونیک";
  if (print) return "نسخه چاپی";
  if (ebook) return "نسخه الکترونیک";
  return null;
}

/**
 * P1-15 meta description: «مناسب آزمون …؛ نمونه رایگان؛ نسخه چاپی و الکترونیک» — only the claims
 * that are true for this book — followed by the start of the description, ≤ 160 chars.
 */
export function productDescription(
  book: Pick<BookDetail, "exam_types" | "has_sample" | "variants" | "description" | "title">,
  max = 160,
): string {
  const claims = [
    book.exam_types.length ? `مناسب آزمون ${book.exam_types.map((e) => e.name).join("، ")}` : null,
    book.has_sample ? "نمونه رایگان" : null,
    formatsClaim(book),
  ].filter(Boolean);
  const head = claims.length ? `${claims.join("؛ ")}.` : `کتاب ${book.title}.`;
  const body = stripHtml(book.description);
  const full = body ? `${head} ${body}` : head;
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > head.length ? cut.slice(0, space) : cut).trim()}…`;
}
