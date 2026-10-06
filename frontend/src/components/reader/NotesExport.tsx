"use client";

import { useId, useState } from "react";
import { formatNumber } from "@/lib/format";
import { exportNotes, saveBlob } from "@/lib/reader";
import { quotaRemaining } from "@/lib/reader-epub";
import type { CopyQuota, NotesExportFormat } from "@/lib/types";
import { DownloadIcon, PrinterIcon } from "@/components/ui/Icons";

const OPTIONS: { format: NotesExportFormat; label: string; hint: string }[] = [
  { format: "md", label: "Markdown (‎.md)", hint: "برای یادداشت‌برداری و ویرایش" },
  { format: "html", label: "نسخه قابل چاپ", hint: "صفحه HTML؛ از مرورگر چاپ یا PDF بگیرید" },
];

function errorText(kind: string): string {
  if (kind === "throttled") return "کمی صبر کنید و دوباره تلاش کنید.";
  if (kind === "auth") return "برای دریافت دفترچه دوباره وارد حساب شوید.";
  if (kind === "forbidden" || kind === "no_ebook") return "دسترسی به یادداشت‌های این کتاب ممکن نیست.";
  return "دریافت دفترچه انجام نشد. دوباره تلاش کنید.";
}

function useExport(slug: string) {
  const [busy, setBusy] = useState<NotesExportFormat | null>(null);
  const [message, setMessage] = useState("");
  const run = async (format: NotesExportFormat) => {
    setBusy(format);
    setMessage("");
    const res = await exportNotes(slug, format);
    setBusy(null);
    if (!res.ok) return setMessage(errorText(res.error.kind));
    saveBlob(res.data);
    setMessage("دفترچه یادداشت دریافت شد.");
  };
  return { busy, message, run };
}

/**
 * «دریافت دفترچه یادداشت» (Phase 6b): highlights, notes and bookmarks of the book as Markdown or a
 * print-friendly HTML page. `variant="drawer"` is a disclosure inside the highlights drawer;
 * `variant="card"` two small secondary buttons for a library card.
 */
export function NotesExportMenu({ slug, variant = "drawer" }: { slug: string; variant?: "drawer" | "card" }) {
  const { busy, message, run } = useExport(slug);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (variant === "card") {
    return (
      <div className="mt-2">
        <p className="text-xs text-ink-muted">دفترچه یادداشت:</p>
        <div className="-ms-2 flex flex-wrap items-center">
          {OPTIONS.map((o) => (
            <button
              key={o.format}
              type="button"
              disabled={busy !== null}
              onClick={() => void run(o.format)}
              className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-xs font-bold text-primary hover:bg-primary-soft disabled:opacity-60"
            >
              {o.format === "md" ? <DownloadIcon size={16} /> : <PrinterIcon size={16} />}
              {busy === o.format ? "در حال آماده‌سازی…" : o.format === "md" ? "Markdown" : "نسخه چاپی"}
            </button>
          ))}
        </div>
        <p role="status" className="text-xs text-ink-muted empty:hidden">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-primary px-3 text-sm font-bold text-primary hover:bg-primary-soft"
      >
        <DownloadIcon size={18} />
        دریافت دفترچه یادداشت
      </button>
      <div id={panelId} hidden={!open} className="mt-2 space-y-1">
        {OPTIONS.map((o) => (
          <button
            key={o.format}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(o.format)}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-1.5 text-start hover:bg-primary-soft disabled:opacity-60"
          >
            {o.format === "md" ? <DownloadIcon size={18} className="shrink-0 text-primary" /> : <PrinterIcon size={18} className="shrink-0 text-primary" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{busy === o.format ? "در حال آماده‌سازی…" : o.label}</span>
              <span className="block text-xs text-ink-muted">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p role="status" className="mt-1 text-xs text-ink-muted empty:hidden">
        {message}
      </p>
    </div>
  );
}

/** «سهمیه کپی باقی‌مانده: ۱۱٬۶۶۰ نویسه» (nothing when the server sent no quota). */
export function CopyQuotaLine({ quota, className = "" }: { quota: CopyQuota | null | undefined; className?: string }) {
  if (!quota) return null;
  const left = quotaRemaining(quota);
  return (
    <p className={`text-xs leading-6 ${left > 0 ? "text-ink-muted" : "font-bold text-danger"} ${className}`}>
      {left > 0 ? `سهمیه کپی باقی‌مانده: ${formatNumber(left)} نویسه` : "سهمیه کپی این کتاب تمام شده است."}
    </p>
  );
}
