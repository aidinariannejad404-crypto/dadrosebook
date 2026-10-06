"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WishlistEntry } from "@/lib/account-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { trackUndoRemove } from "@/lib/analytics";
import { setGuestHeart } from "@/lib/guest-wishlist";
import { BookCard } from "@/components/book/BookCard";
import { TrashIcon } from "@/components/ui/Icons";
import { UndoRow } from "@/components/ui/UndoRow";
import { useUndo } from "@/components/ui/useUndo";

/**
 * Wishlist books as catalog cards, each with a remove button. Removing leaves «حذف شد · بازگرداندن»
 * in the card's place for 6 s (ج۴). `guest`: the list lives in this browser (ج۶).
 */
export function WishlistGrid({ entries, guest = false }: { entries: WishlistEntry[]; guest?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(entries);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  // Server lists refresh once the undo window is over (keeps the account counters right).
  const { store: undo, entries: removed } = useUndo<WishlistEntry>((e) => {
    setItems((xs) => xs.filter((x) => x.book.id !== e.value.book.id));
    if (!guest) router.refresh();
  });

  async function remove(entry: WishlistEntry) {
    const bookId = entry.book.id;
    setBusy(bookId);
    setMessage("");
    if (guest) setGuestHeart(bookId, false);
    else {
      const res = await apiFetch(`/wishlist/${bookId}/`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setBusy(null);
        setMessage(errorMessage(res.error, undefined, "حذف انجام نشد. دوباره تلاش کنید."));
        return;
      }
    }
    setBusy(null);
    undo.push(String(bookId), entry);
  }

  async function restore(entry: WishlistEntry) {
    const bookId = entry.book.id;
    setBusy(bookId);
    if (guest) setGuestHeart(bookId, true);
    else {
      const res = await apiFetch("/wishlist/", { method: "POST", json: { book_id: bookId } });
      if (!res.ok) {
        setBusy(null);
        setMessage(errorMessage(res.error, undefined, "بازگرداندن انجام نشد. دوباره تلاش کنید."));
        return;
      }
    }
    setBusy(null);
    undo.undo(String(bookId));
    trackUndoRemove("wishlist");
    setMessage(`«${entry.book.title}» به علاقه‌مندی‌ها برگشت.`);
  }

  const removedIds = new Set(removed.map((e) => e.value.book.id));
  const gone = (id: number) => removedIds.has(id);

  return (
    <>
      <p role="status" aria-live="polite" className="mb-3 text-sm font-bold text-ink empty:hidden">
        {message}
      </p>
      {items.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-ink-muted">فهرست علاقه‌مندی‌های شما خالی شد.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((entry) => {
            const { book } = entry;
            if (gone(book.id)) {
              return (
                <UndoRow
                  key={book.id}
                  as="li"
                  className="self-start"
                  label={`«${book.title}»`}
                  removedText=" از علاقه‌مندی‌ها حذف شد."
                  onUndo={() => void restore(entry)}
                  busy={busy === book.id}
                />
              );
            }
            return (
              <li key={book.id} className="flex flex-col gap-2">
                <BookCard book={book} showNotify />
                <button
                  type="button"
                  onClick={() => void remove(entry)}
                  disabled={busy === book.id}
                  aria-label={`حذف «${book.title}» از علاقه‌مندی‌ها`}
                  className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-line bg-surface text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
                >
                  <TrashIcon size={16} />
                  {busy === book.id ? "در حال حذف…" : "حذف"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
