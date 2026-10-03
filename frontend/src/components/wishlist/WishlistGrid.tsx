"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WishlistEntry } from "@/lib/account-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { BookCard } from "@/components/book/BookCard";
import { TrashIcon } from "@/components/ui/Icons";

/** Wishlist books as catalog cards, each with a remove button. */
export function WishlistGrid({ entries }: { entries: WishlistEntry[] }) {
  const router = useRouter();
  const [items, setItems] = useState(entries);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function remove(bookId: number, title: string) {
    setBusy(bookId);
    setMessage("");
    const res = await apiFetch(`/wishlist/${bookId}/`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok && res.status !== 404) {
      setMessage(errorMessage(res.error, undefined, "حذف انجام نشد. دوباره تلاش کنید."));
      return;
    }
    setItems((xs) => xs.filter((x) => x.book.id !== bookId));
    setMessage(`«${title}» از علاقه‌مندی‌ها حذف شد.`);
    router.refresh();
  }

  return (
    <>
      <p role="status" aria-live="polite" className="mb-3 text-sm font-bold text-ink empty:hidden">
        {message}
      </p>
      {items.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-ink-muted">فهرست علاقه‌مندی‌های شما خالی شد.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map(({ book }) => (
            <li key={book.id} className="flex flex-col gap-2">
              <BookCard book={book} showNotify />
              <button
                type="button"
                onClick={() => remove(book.id, book.title)}
                disabled={busy === book.id}
                aria-label={`حذف «${book.title}» از علاقه‌مندی‌ها`}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-line bg-surface text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                <TrashIcon size={16} />
                {busy === book.id ? "در حال حذف…" : "حذف"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
