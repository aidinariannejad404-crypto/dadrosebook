"use client";

import { ContinueReading } from "@/components/account/ContinueReading";
import { trackContinueReading } from "@/lib/analytics";
import { useNavSummary } from "@/lib/nav-summary";

/**
 * PF-9: «ادامه مطالعه» at the top of the homepage for customers with a book in progress.
 * Client-side (from /inbox/summary/) so the homepage HTML stays shared and cacheable.
 */
export function HomeContinueReading() {
  const { data } = useNavSummary();
  const entry = data?.continue_reading;
  if (!entry) return null;
  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a")) trackContinueReading({ book_slug: entry.book.slug, placement: "home" });
      }}
    >
      <ContinueReading entry={entry} />
    </div>
  );
}
