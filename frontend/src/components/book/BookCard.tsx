import Link from "next/link";
import { Fragment } from "react";
import type { BookCard as BookCardData } from "@/lib/types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatAverage } from "@/lib/reviews";
import { routes } from "@/lib/config";
import { PRICE_SOON, cardPriceLabel, cardStockNote } from "@/lib/variants";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { Stars } from "@/components/reviews/Stars";
import { BookCover } from "./BookCover";
import { Badges } from "./Badges";
import { formatSummary } from "./FormatBadges";
import { SubjectTag } from "./SubjectTag";
import { CardActions } from "./CardActions";
import { cardDiscount, cardRating, quickAddVariant } from "./card-model";

interface BookCardProps {
  book: BookCardData;
  /** show "موجود شد خبرم کن" when the print edition is out of stock */
  showNotify?: boolean;
  priority?: boolean;
}

const MAX_EXAM_CHIPS = 3;

/**
 * Catalog card. The title link is stretched over the whole card (after:inset-0), so the card is
 * one big link; the heart, quick add and notify buttons are siblings of that link (never nested
 * in it) lifted above it with `relative z-10`, so every control is its own tab stop.
 * Badges come from the server (max 2, P1-20); the meta line carries the resource type and the
 * exam fit (P1-2, P1-11). A discounted card price shows the list price crossed out and a
 * «٪ تخفیف» badge (white on danger red, ≈ 7:1); stars appear from 5 approved reviews up.
 */
export function BookCard({ book, showNotify = false, priority = false }: BookCardProps) {
  const priceLabel = cardPriceLabel(book.card_format);
  const printOut = book.formats.includes("PRINT") && !book.print_in_stock;
  const stockNote = cardStockNote(book);
  const author = book.authors.map((a) => a.name).join("، ");
  const exams = book.exam_types.slice(0, MAX_EXAM_CHIPS);
  const moreExams = book.exam_types.length - exams.length;
  // the bundle badge already says «چاپی + الکترونیک»
  // the quick-review badge already names the resource type
  const typeLabel = book.badges.some((b) => b.code === "quick_review") ? "" : book.resource_type_label;
  const meta = typeLabel || exams.length > 0;
  const formats = book.badges.some((b) => b.code === "bundle") ? null : formatSummary(book.formats);
  const discount = cardDiscount(book);
  const rating = cardRating(book);
  const quickAdd = quickAddVariant(book);
  const notify = showNotify && printOut;

  return (
    <article className="group relative flex h-full flex-col rounded-card bg-surface p-2.5 shadow-card transition-[box-shadow,transform] duration-300 focus-within:shadow-raised hover:shadow-raised motion-safe:md:hover:-translate-y-1">
      <div className="relative">
        <BookCover
          title={book.title}
          cover={book.cover}
          subjects={book.subjects}
          authors={book.authors}
          volumes={book.volumes}
          priority={priority}
          sizes="(min-width: 1024px) 150px, (min-width: 768px) 18vw, 36vw"
          className={book.in_stock ? "" : "opacity-60 grayscale-[35%]"}
        />
        {!book.in_stock && (
          <span className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
            ناموجود
          </span>
        )}
        {discount && book.in_stock && (
          <span className="absolute start-0 top-1 rounded-full bg-danger px-2 py-0.5 text-[0.6875rem] font-extrabold leading-5 text-white shadow-card">
            {toPersianDigits(discount.percent)}٪ تخفیف
          </span>
        )}
        <CardActions
          bookId={book.id}
          bookTitle={book.title}
          bookSlug={book.slug}
          quickAdd={quickAdd ?? null}
          price={book.card_price}
          format={book.card_format}
        />
      </div>

      <div className="mt-2.5 flex flex-1 flex-col gap-1.5">
        <Badges badges={book.badges} />
        <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-bold leading-[1.375rem] text-ink">
          <Link
            href={routes.product(book.slug)}
            className="rounded-sm after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
          >
            {book.title}
          </Link>
        </h3>
        {author && (
          // author pages (package ب): links lifted above the stretched title link; the line itself lets
          // clicks through (pointer-events-none) and each name gets a 44px-tall hit area (py-3 -my-3)
          <p className="pointer-events-none relative z-10 -my-3 truncate py-3 text-xs text-ink-muted">
            {book.authors.map((a, i) => (
              <Fragment key={a.id}>
                {i > 0 && "، "}
                <Link
                  prefetch={false}
                  href={routes.author(a.slug)}
                  className="pointer-events-auto -my-3 inline-block py-3 hover:text-primary hover:underline"
                >
                  {a.name}
                </Link>
              </Fragment>
            ))}
          </p>
        )}
        {rating && (
          <p className="flex items-center gap-1 text-[0.6875rem] leading-5 text-ink-muted">
            <Stars value={rating.avg} size={13} />
            <span className="font-bold text-ink" aria-hidden="true">
              {formatAverage(rating.avg)}
            </span>
            <span>({toPersianDigits(rating.count)} نظر)</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {book.subjects.slice(0, 2).map((s) => (
            <SubjectTag key={s.id} subject={s} />
          ))}
        </div>
        {meta && (
          <p className="text-[0.6875rem] leading-5 text-ink-muted">
            {typeLabel}
            {typeLabel && exams.length > 0 && " · "}
            {exams.length > 0 && <span className="sr-only">مناسب آزمون: </span>}
            {exams.map((e) => e.short_name).join("، ")}
            {moreExams > 0 && " و …"}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
          {book.card_price != null ? (
            <>
              {discount && (
                <p className="text-xs text-ink-muted">
                  <span className="sr-only">قیمت پیش از تخفیف: </span>
                  {/* a drawn line through the middle: text-decoration sits too low on Persian digits */}
                  <del className="relative no-underline [text-decoration:none] before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-rotate-6 before:bg-danger before:content-['']">
                    {formatToman(discount.compare)}
                  </del>
                </p>
              )}
              <p className={`text-sm font-extrabold ${book.in_stock ? "text-ink" : "text-ink-muted"}`}>
                {discount && <span className="sr-only">قیمت با تخفیف: </span>}
                {formatToman(book.card_price)}
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-ink-muted">{PRICE_SOON}</p>
          )}
          {stockNote ? (
            <p className="text-[0.6875rem] font-bold leading-5 text-warning">{stockNote}</p>
          ) : (
            (priceLabel ?? formats) && <p className="text-xs text-ink-muted">{priceLabel ?? formats}</p>
          )}
        </div>
        {notify && (
          <NotifyMeButton
            bookId={book.id}
            bookTitle={book.title}
            bookSlug={book.slug}
            source="card"
            ebookAvailable={book.formats.includes("EBOOK") && book.in_stock}
            size="sm"
            className="relative z-10 mt-1 w-full"
          />
        )}
      </div>
    </article>
  );
}
