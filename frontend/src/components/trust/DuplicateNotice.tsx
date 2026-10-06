"use client";

import { duplicateWarning } from "@/lib/owned";
import type { VariantType } from "@/lib/types";
import { useOwned } from "./useOwned";

/** د۱ cart / buy-box warning when the customer already owns this format of the book. */
export function DuplicateNotice({ bookId, type, className = "" }: { bookId: number; type: VariantType; className?: string }) {
  const state = useOwned();
  const text = state?.kind === "user" ? duplicateWarning(state.books.get(bookId), type) : null;
  if (!text) return null;
  return <p className={`rounded-control bg-info-soft px-3 py-2 text-xs font-bold leading-6 text-info ${className}`}>{text}</p>;
}
