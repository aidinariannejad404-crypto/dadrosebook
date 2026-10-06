"use client";

import { useEffect } from "react";
import { rememberViewed, type ViewedBook } from "./recently-viewed";

/** Records a product view for the homepage «بازدیدهای اخیر» rail. Renders nothing. */
export function RememberViewed({ book }: { book: ViewedBook }) {
  const { id } = book;
  useEffect(() => {
    rememberViewed(book);
    // once per book; the snapshot itself does not need to re-trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
