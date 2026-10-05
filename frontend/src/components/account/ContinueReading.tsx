import Link from "next/link";
import type { LibraryEntry, LibraryProgress } from "@/lib/account-types";
import { accountRoutes } from "@/lib/account-routes";
import { BookCover } from "@/components/book/BookCover";
import { BookOpenIcon } from "@/components/ui/Icons";
import { ReadingProgressMeter } from "./ReadingProgressMeter";

/**
 * «ادامه مطالعه» strip: the ebook the customer read most recently, on a navy panel with a gold
 * call to action straight into the reader at the saved page.
 */
export function ContinueReading({
  entry,
  headingLevel = 2,
}: {
  entry: LibraryEntry & { progress: LibraryProgress };
  headingLevel?: 2 | 3;
}) {
  const { book, progress } = entry;
  const H = `h${headingLevel}` as "h2" | "h3";
  const headingId = `continue-${book.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="relative overflow-hidden rounded-card bg-primary p-4 text-white shadow-raised md:p-5"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full border-[18px] border-accent/25"
      />
      <div className="relative flex items-center gap-4">
        <div className="w-20 shrink-0 md:w-24">
          <BookCover
            title={book.title}
            cover={book.cover}
            subjects={book.subjects}
            authors={book.authors}
            volumes={book.volumes}
            sizes="96px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-accent">ادامه مطالعه</p>
          <H id={headingId} className="mt-0.5 line-clamp-2 text-base font-extrabold leading-7 text-white md:text-lg">
            {book.title}
          </H>
          <div className="mt-2 max-w-sm">
            <ReadingProgressMeter progress={progress} title={book.title} tone="dark" />
          </div>
        </div>
      </div>
      <Link
        href={accountRoutes.read(book.slug)}
        className="relative mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-accent px-5 text-base font-extrabold text-ink shadow-card hover:brightness-105 focus-visible:outline-white sm:w-auto"
      >
        <BookOpenIcon size={20} />
        ادامه مطالعه
        <span className="sr-only">{book.title}</span>
      </Link>
    </section>
  );
}
