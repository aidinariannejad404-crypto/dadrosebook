"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/format";
import { HIGHLIGHT_COLORS, groupHighlightsByPage } from "@/lib/reader";
import type { Bookmark, CopyQuota, Highlight } from "@/lib/types";
import { BookmarkIcon, NoteIcon, TrashIcon } from "@/components/ui/Icons";
import { ReaderDrawer } from "./ReaderChrome";
import { CopyQuotaLine, NotesExportMenu } from "./NotesExport";

const SWATCH = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.value, c]));

export type NotesTab = "highlights" | "bookmarks";

interface HighlightsDrawerProps {
  open: boolean;
  onClose: () => void;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  currentPage: number;
  /** open a highlight's position (PDF: its page; EPUB: its chapter + offset) */
  onJump: (h: Highlight) => void;
  onEdit: (h: Highlight) => void;
  onJumpBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (b: Bookmark) => void;
  initialTab?: NotesTab;
  /** Phase 6b: notebook export («دریافت دفترچه یادداشت») for this book */
  slug?: string;
  /** Phase 6b: remaining total copy quota line */
  copyQuota?: CopyQuota | null;
}

const TABS: { value: NotesTab; label: string }[] = [
  { value: "highlights", label: "هایلایت‌ها" },
  { value: "bookmarks", label: "نشانک‌ها" },
];

/**
 * «هایلایت‌ها و نشانک‌ها» drawer for both readers: native <dialog> (focus containment, Esc,
 * backdrop click) docked to the inline-end edge, with two tabs.
 */
export function HighlightsDrawer({
  open,
  onClose,
  highlights,
  bookmarks,
  currentPage,
  onJump,
  onEdit,
  onJumpBookmark,
  onDeleteBookmark,
  initialTab = "highlights",
  slug,
  copyQuota,
}: HighlightsDrawerProps) {
  const [tab, setTab] = useState<NotesTab>(initialTab);
  const baseId = useId();
  const tabRefs = useRef<Record<NotesTab, HTMLButtonElement | null>>({ highlights: null, bookmarks: null });

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: NotesTab = tab === "highlights" ? "bookmarks" : "highlights";
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const groups = groupHighlightsByPage(highlights);
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.page - b.page || a.id - b.id);

  return (
    <ReaderDrawer open={open} onClose={onClose} title="هایلایت‌ها و نشانک‌ها">
      <div role="tablist" aria-label="نوع یادداشت" className="flex gap-1 border-b border-line px-3">
        {TABS.map((t) => {
          const on = t.value === tab;
          const count = t.value === "highlights" ? highlights.length : bookmarks.length;
          return (
            <button
              key={t.value}
              ref={(el) => {
                tabRefs.current[t.value] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-${t.value}-tab`}
              aria-selected={on}
              aria-controls={`${baseId}-${t.value}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.value)}
              onKeyDown={onTabKey}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-3 text-sm font-bold ${
                on ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-primary-soft px-1.5 text-xs">{formatNumber(count)}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-highlights-panel`}
        aria-labelledby={`${baseId}-highlights-tab`}
        hidden={tab !== "highlights"}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {groups.length === 0 ? (
          <p className="text-sm leading-7 text-ink-muted">
            هنوز هایلایتی ندارید. بخشی از متن را انتخاب کنید تا بتوانید آن را رنگی کنید یا برایش یادداشت بنویسید.
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
                          onJump(h);
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

      <div
        role="tabpanel"
        id={`${baseId}-bookmarks-panel`}
        aria-labelledby={`${baseId}-bookmarks-tab`}
        hidden={tab !== "bookmarks"}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {sortedBookmarks.length === 0 ? (
          <p className="text-sm leading-7 text-ink-muted">
            هنوز نشانکی ندارید. با دکمه نشانک در نوار بالا، صفحه فعلی را نشانه‌گذاری کنید.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedBookmarks.map((b) => (
              <li key={b.id} className="flex items-stretch gap-1 rounded-control border border-line">
                <button
                  type="button"
                  onClick={() => {
                    onJumpBookmark(b);
                    onClose();
                  }}
                  className="flex min-h-11 flex-1 items-center gap-2 rounded-control p-2.5 text-start hover:bg-primary-soft"
                >
                  <BookmarkIcon size={18} filled className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      صفحه {formatNumber(b.page)}
                      {b.page === currentPage && <span className="ms-2 text-xs font-medium text-ink-muted">(صفحه فعلی)</span>}
                    </span>
                    {b.label && <span className="block truncate text-xs leading-5 text-ink-muted">{b.label}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteBookmark(b)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-danger hover:bg-danger-soft"
                  aria-label={`حذف نشانک صفحه ${formatNumber(b.page)}`}
                >
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(slug || copyQuota) && (
        <div className="space-y-1 border-t border-line px-5 py-3">
          {slug && <NotesExportMenu slug={slug} />}
          <CopyQuotaLine quota={copyQuota} className="text-center" />
        </div>
      )}
    </ReaderDrawer>
  );
}
