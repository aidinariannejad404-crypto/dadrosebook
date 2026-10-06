"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { formatJalaliDay } from "@/lib/order-status";
import { apiFetch, errorMessage } from "@/lib/session";
import type { NotifyEntry } from "@/lib/trust-types";
import { MiniCover } from "@/components/account/MiniCover";
import { BellIcon } from "@/components/ui/Icons";

/** د۴ the «خبرم کن» list with cancel (optimistic; restored on failure). */
export function NotifyList({ entries: initial }: { entries: NotifyEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function cancel(entry: NotifyEntry) {
    if (busy != null) return;
    setBusy(entry.id);
    setMessage(null);
    const res = await apiFetch<void>(`/me/back-in-stock/${entry.id}/`, { method: "DELETE" });
    setBusy(null);
    if (res.ok || res.status === 404) {
      setEntries((list) => list.filter((e) => e.id !== entry.id));
      setMessage({ ok: true, text: `درخواست «${entry.book.title}» لغو شد.` });
      track("notify_me_cancelled", { item_id: entry.book.id, variant: entry.variant.type });
    } else {
      setMessage({ ok: false, text: errorMessage(res.error, undefined, "لغو انجام نشد. دوباره تلاش کنید.") });
    }
  }

  return (
    <div>
      {entries.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card bg-surface p-4 text-sm leading-7 text-ink-muted shadow-card">
          <BellIcon size={18} className="shrink-0 text-primary" />
          درخواست «خبرم کن» فعالی ندارید. روی کتاب‌های ناموجود «خبرم کن» را بزنید تا با پیامک خبرتان کنیم.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <MiniCover title={e.book.title} cover={e.book.cover} color={e.book.subject_color} className="w-10" />
              <div className="min-w-0 flex-1 text-sm">
                <Link href={routes.product(e.book.slug)} className="font-bold leading-6 text-ink hover:text-primary hover:underline">
                  {e.book.title}
                </Link>
                <p className="text-xs text-ink-muted">
                  {e.variant.type_label} · ثبت {formatJalaliDay(e.created_at)}
                </p>
                {e.status === "NOTIFIED" ? (
                  <p className="mt-0.5 text-xs font-bold text-success">موجود شد؛ پیامک فرستاده شد</p>
                ) : e.variant.in_stock ? (
                  <p className="mt-0.5 text-xs font-bold text-success">هم‌اکنون موجود است</p>
                ) : (
                  <p className="mt-0.5 text-xs font-bold text-ink-muted">{e.status_label}</p>
                )}
              </div>
              {e.status === "PENDING" && (
                <button
                  type="button"
                  onClick={() => void cancel(e)}
                  aria-disabled={busy === e.id || undefined}
                  aria-label={`لغو «خبرم کن» برای ${e.book.title}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft aria-disabled:opacity-60"
                >
                  {busy === e.id ? "در حال لغو…" : "لغو"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p role="status" className={`mt-2 text-sm font-bold empty:hidden ${message?.ok ? "text-success" : "text-danger"}`}>
        {message?.text}
      </p>
    </div>
  );
}
