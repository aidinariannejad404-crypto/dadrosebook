import type { BookCard as BookCardData } from "@/lib/types";
import { BookCard } from "./BookCard";

interface BookRailProps {
  books: BookCardData[];
  labelledBy: string;
  showNotify?: boolean;
}

/** Horizontal scroll-snap rail on mobile, grid from md up. No carousel library. */
export function BookRail({ books, labelledBy, showNotify = false }: BookRailProps) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-6"
    >
      {books.map((book) => (
        <li key={book.id} className="w-[44%] max-w-[12.5rem] shrink-0 snap-start md:w-auto md:max-w-none">
          <BookCard book={book} showNotify={showNotify} />
        </li>
      ))}
    </ul>
  );
}
