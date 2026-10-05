import type { LibraryProgress } from "@/lib/account-types";
import { formatNumber, formatPercent } from "@/lib/format";
import { formatJalaliDay } from "@/lib/order-status";

/** True when the reader has opened the book and is not on its last page. */
export function isInProgress(p: LibraryProgress | null | undefined): p is LibraryProgress {
  return !!p && p.total_pages > 0 && p.page < p.total_pages;
}

export function isFinished(p: LibraryProgress | null | undefined): boolean {
  return !!p && p.total_pages > 0 && p.page >= p.total_pages;
}

/** The library entry the reader touched most recently and has not finished (null when none). */
export function mostRecentInProgress<T extends { progress?: LibraryProgress | null; can_read: boolean }>(
  entries: T[],
): (T & { progress: LibraryProgress }) | null {
  let best: (T & { progress: LibraryProgress }) | null = null;
  for (const e of entries) {
    if (!e.can_read || !isInProgress(e.progress)) continue;
    if (!best || Date.parse(e.progress.updated_at) > Date.parse(best.progress.updated_at)) {
      best = e as T & { progress: LibraryProgress };
    }
  }
  return best;
}

/**
 * Reading progress: a labelled progress bar, «صفحه X از Y · N٪» and the Jalali day it was last
 * read. Without progress it says the book has not been opened yet.
 */
export function ReadingProgressMeter({
  progress,
  title,
  tone = "light",
}: {
  progress: LibraryProgress | null | undefined;
  /** book title, for the progress bar's accessible name */
  title: string;
  /** "dark" on the navy continue-reading strip */
  tone?: "light" | "dark";
}) {
  const muted = tone === "dark" ? "text-white/80" : "text-ink-muted";
  if (!progress || progress.total_pages <= 0) {
    return <p className={`text-xs ${muted}`}>هنوز شروع نکرده‌اید</p>;
  }
  const percent = Math.max(0, Math.min(100, progress.percent));
  const done = isFinished(progress);
  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label={`پیشرفت مطالعه ${title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${formatPercent(percent)}، صفحه ${formatNumber(progress.page)} از ${formatNumber(progress.total_pages)}`}
        className={`h-2 overflow-hidden rounded-full ${tone === "dark" ? "bg-white/20" : "bg-primary-tint"}`}
      >
        <div
          className={`h-full rounded-full ${done ? "bg-success" : "bg-accent"}`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <p className={`mt-1.5 flex flex-wrap items-center justify-between gap-x-2 text-xs ${muted}`}>
        <span className={tone === "dark" ? "font-bold text-white" : "font-bold text-ink"}>
          {done ? "تمام شد" : `صفحه ${formatNumber(progress.page)} از ${formatNumber(progress.total_pages)}`}
        </span>
        <span aria-hidden="true">{formatPercent(percent)}</span>
      </p>
      <p className={`mt-0.5 text-xs ${muted}`}>
        آخرین مطالعه: <time dateTime={progress.updated_at}>{formatJalaliDay(progress.updated_at)}</time>
      </p>
    </div>
  );
}
