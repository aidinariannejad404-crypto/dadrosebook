"use client";

import { useEffect, useRef } from "react";
import { UNDO_MS } from "@/lib/undo";

interface UndoRowProps {
  /** e.g. «حقوق مدنی» (چاپی) */
  label: string;
  /** "از سبد حذف شد" */
  removedText: string;
  onUndo: () => void;
  busy?: boolean;
  error?: string | null;
  className?: string;
  as?: "li" | "div";
  /** move focus to «بازگرداندن» when the row appears (the removed control's focus would be lost) */
  focusOnMount?: boolean;
}

/**
 * Collapsed placeholder for a removed item (ج۴): «… حذف شد · بازگرداندن» with a shrinking bar that
 * shows the 6-second window (static under reduced motion). Announced politely once.
 */
export function UndoRow({ label, removedText, onUndo, busy = false, error = null, className = "", as: Tag = "div", focusOnMount = true }: UndoRowProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) button.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  return (
    <Tag className={`relative overflow-hidden rounded-card border border-dashed border-line-strong bg-surface ${className}`}>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <p role="status" aria-live="polite" className="min-w-0 text-sm text-ink">
          <span className="line-clamp-1 font-bold">{label}</span>
          <span className="text-ink-muted">{removedText}</span>
        </p>
        <button
          ref={button}
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="press inline-flex min-h-11 shrink-0 items-center rounded-control border border-primary px-4 text-sm font-extrabold text-primary hover:bg-primary-soft disabled:opacity-60"
        >
          {busy ? "در حال بازگرداندن…" : "بازگرداندن"}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm font-bold text-danger sm:px-4">
          {error}
        </p>
      )}
      <span
        aria-hidden="true"
        className="undo-timer absolute inset-x-0 bottom-0 h-1 origin-[100%_50%] bg-primary/30"
        style={{ animationDuration: `${UNDO_MS}ms` }}
      />
    </Tag>
  );
}
