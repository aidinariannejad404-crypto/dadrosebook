"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toPersianDigits } from "@/lib/format";
import { CloseIcon } from "@/components/ui/Icons";

interface FilterSheetProps {
  /** active filter count shown on the button */
  activeCount: number;
  /** current result count for the «نمایش …» footer button */
  resultCount: number;
  children: ReactNode;
}

/** Sliders icon kept local (only used here). */
function FilterIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

/**
 * Mobile bottom sheet (below lg) holding the server-rendered FilterPanel. Built on the native <dialog>
 * (focus containment, Esc, inert page). Choosing a filter link navigates and closes the sheet.
 */
export function FilterSheet({ activeCount, resultCount, children }: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-bold text-ink hover:bg-primary-soft"
      >
        <FilterIcon />
        فیلترها
        {activeCount > 0 && (
          <span className="grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs leading-6 text-white">
            <span className="sr-only">(</span>
            {toPersianDigits(activeCount)}
            <span className="sr-only"> فیلتر فعال)</span>
          </span>
        )}
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
          else if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="mx-0 mb-0 mt-auto max-h-[88dvh] w-full max-w-full rounded-t-card bg-surface p-0 text-ink shadow-raised backdrop:bg-[color-mix(in_srgb,var(--color-text)_60%,transparent)]"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <h2 id={titleId} className="text-base font-bold">
              فیلترها
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-me-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-ink"
              aria-label="بستن"
            >
              <CloseIcon size={22} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
          <div className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-12 w-full rounded-control bg-primary px-4 text-base font-bold text-white hover:bg-primary-hover"
            >
              نمایش {toPersianDigits(resultCount)} کتاب
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
