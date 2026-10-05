"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { routes } from "@/lib/config";
import { BookCover } from "@/components/book/BookCover";
import { readViewed, type ViewedBook } from "@/components/book/recently-viewed";
import { HomeSectionHeader } from "./HomeSectionHeader";

/**
 * «بازدیدهای اخیر» — books this browser opened recently (localStorage, recorded by
 * <RememberViewed> on product pages). Hydration-safe: the server and the first client render
 * output nothing; the list is read after mount. Renders nothing when the list is empty, and sits
 * low on the page so appearing late never shifts content above the fold.
 */
export function RecentlyViewed({ excludeIds = [] }: { excludeIds?: number[] }) {
  const [books, setBooks] = useState<ViewedBook[]>([]);
  const exclude = excludeIds.join(",");

  useEffect(() => {
    const skip = new Set(exclude ? exclude.split(",").map(Number) : []);
    setBooks(readViewed().filter((b) => !skip.has(b.id)));
  }, [exclude]);

  if (books.length === 0) return null;

  return (
    <section aria-labelledby="recent-title">
      <HomeSectionHeader id="recent-title" title="بازدیدهای اخیر شما" subtitle="از همان‌جایی که بودید ادامه دهید" />
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:px-0">
        {books.map((b) => (
          <li key={b.id} className="w-[6.75rem] shrink-0 snap-start md:w-32">
            <Link
              prefetch={false}
              href={routes.product(b.slug)}
              className="group flex flex-col gap-1.5 rounded-control p-1 hover:bg-surface"
            >
              <BookCover
                title={b.title}
                cover={b.cover}
                subjects={b.subjects}
                authors={b.authors}
                volumes={b.volumes}
                sizes="128px"
              />
              <span className="line-clamp-2 text-xs font-bold leading-5 text-ink">{b.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
