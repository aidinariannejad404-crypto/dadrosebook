"use client";

import { useEffect, useId, useRef } from "react";
import { formatNumber } from "@/lib/format";
import { HIGHLIGHT_COLORS, groupHighlightsByPage } from "@/lib/reader";
import type { Highlight } from "@/lib/types";
import { CloseIcon, NoteIcon } from "@/components/ui/Icons";

const SWATCH = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.value, c]));

interface HighlightsDrawerProps {
  open: boolean;
  onClose: () => void;
  highlights: Highlight[];
  currentPage: number;
  onJump: (page: number) => void;
  onEdit: (h: Highlight) => void;
}

/**
 * «هایلایت‌ها و یادداشت‌ها» side drawer — the same native <dialog> pattern as ui/Dialog
 * (focus containment, Esc, backdrop click), docked to the inline-end edge.
 */
export function HighlightsDrawer({ open, onClose, highlights, currentPage, onJump, onEdit }: HighlightsDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const groups = groupHighlightsByPage(highlights);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 ms-auto h-dvh max-h-dvh w-[min(24rem,100%)] max-w-full bg-surface p-0 text-ink shadow-raised backdrop:bg-[color-mix(in_srgb,var(--color-text)_60%,transparent)]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-base font-bold">
            هایلایت‌ها و یادداشت‌ها
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-me-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-ink"
            aria-label="بستن"
          >
            <CloseIcon size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="text-sm leading-7 text-ink-muted">
              هنوز هایلایتی ندارید. بخشی از متن صفحه را انتخاب کنید تا بتوانید آن را رنگی کنید یا برایش یادداشت بنویسید.
            </p>
          ) : (
            <ol className="space-y-5">
              {groups.map((g) => (
                <li key={g.page}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
                    صفحه {formatNumber(g.page)}
                    {g.page === currentPage && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-ink">صفحه فعلی</span>
                    )}
                  </h3>
                  <ul className="space-y-2">
                    {g.items.map((h) => (
                      <li key={h.id} className="flex items-stretch gap-1 rounded-control border border-line">
                        <button
                          type="button"
                          onClick={() => {
                            onJump(h.page);
                            onClose();
                          }}
                          className="flex min-h-11 flex-1 items-start gap-2 rounded-control p-2.5 text-start hover:bg-primary-soft"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-3 shrink-0 rounded-full border border-line-strong"
                            style={{ backgroundColor: SWATCH[h.color]?.swatch }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="sr-only">{`هایلایت ${SWATCH[h.color]?.label ?? ""}، رفتن به صفحه ${formatNumber(h.page)}: `}</span>
                            <span className="line-clamp-3 text-sm leading-6">{h.text}</span>
                            {h.note && (
                              <span className="mt-1 flex items-start gap-1 text-xs leading-5 text-ink-muted">
                                <NoteIcon size={14} className="mt-0.5 shrink-0" />
                                <span className="line-clamp-3">{h.note}</span>
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(h)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-2 text-xs font-bold text-primary hover:bg-primary-soft"
                          aria-label={`ویرایش هایلایت صفحه ${formatNumber(h.page)}`}
                        >
                          ویرایش
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </dialog>
  );
}
