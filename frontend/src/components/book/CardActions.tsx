"use client";

import { useSyncExternalStore } from "react";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { CompareToggle } from "@/components/compare/CompareToggle";
import { QuickAddButton } from "./QuickAddButton";

const subscribe = () => () => {};

interface CardActionsProps {
  bookId: number;
  bookTitle: string;
  /** د۶: enables the compare toggle (bottom-start of the cover) */
  bookSlug?: string;
  /** variant for «افزودن به سبد»; null when the card's own variant is out of stock */
  quickAdd: number | null;
  price: number | null;
  format: string | null;
}

/**
 * Wishlist heart and quick-add on a book card, mounted only in the browser. Both are overlays
 * (absolutely positioned, no layout shift) that need JS anyway, so leaving them out of the
 * server HTML keeps rails of 12+ cards light on the homepage (mobile FCP/LCP).
 */
export function CardActions({ bookId, bookTitle, bookSlug, quickAdd, price, format }: CardActionsProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return (
    <>
      <WishlistButton
        bookId={bookId}
        bookTitle={bookTitle}
        className="absolute -end-1 -top-1 z-10 [&_button]:border-transparent [&_button]:shadow-card"
      />
      {bookSlug && (
        <CompareToggle
          book={{ id: bookId, slug: bookSlug, title: bookTitle }}
          className="absolute -bottom-1 -start-1 z-10"
        />
      )}
      {quickAdd != null && (
        <QuickAddButton
          variantId={quickAdd}
          bookId={bookId}
          bookTitle={bookTitle}
          price={price}
          format={format}
          className="absolute -bottom-1 -end-1 shadow-raised"
        />
      )}
    </>
  );
}
