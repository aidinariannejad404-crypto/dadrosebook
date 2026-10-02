import Link from "next/link";
import type { BookCard as BookCardData } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { routes } from "@/lib/config";
import { NotifyMeButton } from "@/components/ui/NotifyMeButton";
import { BookCover } from "./BookCover";
import { FormatBadges } from "./FormatBadges";
import { SubjectTag } from "./SubjectTag";

interface BookCardProps {
  book: BookCardData;
  /** show "موجود شد خبرم کن" when the print edition is out of stock */
  showNotify?: boolean;
  priority?: boolean;
}

/**
 * Catalog card. The title link is stretched over the whole card (after:inset-0), so the
 * card is one big link while the notify button can still sit on top of it.
 */
export function BookCard({ book, showNotify = false, priority = false }: BookCardProps) {
  const fromPrice = book.formats.length > 1;
  const printOut = book.formats.includes("PRINT") && !book.print_in_stock;
  const author = book.authors.map((a) => a.name).join("، ");

  return (
    <article className="group relative flex h-full flex-col rounded-card bg-surface p-2.5 shadow-card transition-shadow focus-within:shadow-raised hover:shadow-raised">
      <div className="relative">
        <BookCover
          title={book.title}
          cover={book.cover}
          subjects={book.subjects}
          authors={book.authors}
          volumes={book.volumes}
          priority={priority}
          sizes="(min-width: 1024px) 190px, (min-width: 768px) 22vw, 44vw"
          className={book.in_stock ? "" : "opacity-60 grayscale-[35%]"}
        />
        {!book.in_stock && (
          <span className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
            ناموجود
          </span>
        )}
        {book.is_quick_review && book.in_stock && (
          <span className="absolute bottom-2 end-2 rounded-md bg-accent px-1.5 py-0.5 text-[0.6875rem] font-extrabold text-ink">
            سریع‌خوان
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-1 flex-col gap-1.5">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-bold leading-[1.375rem] text-ink">
          <Link
            href={routes.product(book.slug)}
            className="rounded-sm after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
          >
            {book.title}
          </Link>
        </h3>
        {author && <p className="line-clamp-1 text-xs text-ink-muted">{author}</p>}
        <div className="flex flex-wrap items-center gap-1">
          {book.subjects.slice(0, 2).map((s) => (
            <SubjectTag key={s.id} subject={s} />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <FormatBadges formats={book.formats} />
          {book.min_price != null ? (
            <p className={`text-sm font-extrabold ${book.in_stock ? "text-ink" : "text-ink-muted"}`}>
              {fromPrice && <span className="text-xs font-medium text-ink-muted">از </span>}
              {formatToman(book.min_price)}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">قیمت به‌زودی</p>
          )}
          {printOut && book.in_stock && (
            <p className="text-xs font-medium text-danger">فقط نسخه الکترونیک موجود است</p>
          )}
        </div>
        {showNotify && printOut && (
          <NotifyMeButton
            bookId={book.id}
            bookTitle={book.title}
            ebookAvailable={book.formats.includes("EBOOK")}
            size="sm"
            className="relative z-10 mt-1 w-full"
          />
        )}
      </div>
    </article>
  );
}
