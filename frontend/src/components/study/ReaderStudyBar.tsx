"use client";

import Link from "next/link";
import { useEffect } from "react";
import { toPersianDigits } from "@/lib/format";
import { goalPercent, minutesForPages, studyRoutes, timeLeftText } from "@/lib/study";
import { CloseIcon } from "@/components/ui/Icons";
import { CelebrationBadge } from "./GoalRing";
import { useReadingHeartbeat } from "./useReadingHeartbeat";

/**
 * Reader chrome strip (R7 + R8): today's minutes toward the goal, «حدود N دقیقه تا پایان فصل»
 * from the measured speed, and a one-time celebration when the goal (or a 7/30-day streak) is
 * reached. Also runs the active-reading heartbeat.
 *
 * `chapterEnd` is the chapter's last page (null → the end of the book is used).
 */
export function ReaderStudyBar({
  slug,
  page,
  totalPages,
  chapterEnd,
  className = "",
  visible = true,
}: {
  slug: string;
  page: number;
  totalPages: number;
  chapterEnd: number | null;
  className?: string;
  /** false while the reader chrome is hidden: the heartbeat keeps running, only the strip hides */
  visible?: boolean;
}) {
  const { state, celebration, dismissCelebration } = useReadingHeartbeat(slug, page, totalPages > 0);

  useEffect(() => {
    if (!celebration) return;
    const t = window.setTimeout(dismissCelebration, 8000);
    return () => window.clearTimeout(t);
  }, [celebration, dismissCelebration]);

  if (!state) return null;
  const end = chapterEnd ?? totalPages;
  const pagesLeft = Math.max(0, end - page + 1);
  const left = state.pace ? minutesForPages(pagesLeft, state.pace.pages_per_minute) : null;
  const pct = goalPercent(state.minutes, state.goalMinutes);

  return (
    <>
      <div className={`${visible ? "flex" : "hidden"} min-w-0 items-center gap-2 text-xs ${className}`}>
        <Link
          href={studyRoutes.report}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-1.5 font-bold text-ink hover:bg-primary-soft"
          aria-label={`امروز ${toPersianDigits(state.minutes)} از ${toPersianDigits(state.goalMinutes)} دقیقه هدف؛ کارنامه مطالعه`}
        >
          <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-primary-tint">
            <span
              className={`absolute inset-y-0 start-0 rounded-full ${state.goalMet ? "bg-success" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span aria-hidden="true" className="tabular-nums">
            {toPersianDigits(state.minutes)}/{toPersianDigits(state.goalMinutes)} دقیقه
          </span>
        </Link>
        {left != null && totalPages > 0 && (
          <span className="min-w-0 truncate text-ink-muted" title={state.pace?.measured ? "بر اساس سرعت مطالعه شما" : "تخمین اولیه"}>
            {timeLeftText(left, chapterEnd != null ? "chapter" : "book")}
          </span>
        )}
      </div>
      {celebration && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-card bg-surface p-3 shadow-raised"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CelebrationBadge milestone={celebration.kind === "milestone" ? celebration.days : null} compact />
            </div>
            <button
              type="button"
              onClick={dismissCelebration}
              aria-label="بستن"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted hover:bg-primary-soft"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
