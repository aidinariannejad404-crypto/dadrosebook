"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/format";
import { HIGHLIGHT_COLORS, groupHighlightsByPage } from "@/lib/reader";
import type { Bookmark, CopyQuota, Highlight } from "@/lib/types";
import { BookmarkIcon, NoteIcon, TrashIcon } from "@/components/ui/Icons";
import { relocatedHint, splitRelocated } from "@/lib/reader-anchor";
import { ReaderDrawer } from "./ReaderChrome";
import { MovedIcon } from "./ReaderIcons";
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

  // ه۱: items the server could not find in the current file version are listed apart, never dropped
  const { placed: placedHighlights, relocated: movedHighlights } = splitRelocated(highlights);
  const { placed: placedBookmarks, relocated: movedBookmarks } = splitRelocated(bookmarks);
  const groups = groupHighlightsByPage(placedHighlights);
  const sortedBookmarks = [...placedBookmarks].sort((a, b) => a.page - b.page || a.id - b.id);
  const movedCount = movedHighlights.length + movedBookmarks.length;

  return (
    <ReaderDrawer open={open} onClose={onClose} title="هایلایت‌ها و نشانک‌ها">
      <div role="tablist" aria-label="نوع یادداشت" className="flex gap-1 border-b border-line px-3">
        {TABS.map((t) => {
          const on = t.value === tab;
          const count = t.value === "highlights" ? placedHighlights.length + movedCount : placedBookmarks.length;
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
        {groups.length === 0 && movedCount === 0 ? (
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
        {movedCount > 0 && (
          <RelocatedNotes
            highlights={movedHighlights}
            bookmarks={movedBookmarks}
            onEdit={onEdit}
            onDeleteBookmark={onDeleteBookmark}
          />
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

/**
 * ه۱ «یادداشت‌های جابه‌جا شده»: highlights and bookmarks whose text was not found in the new file
 * version. They keep their text and note; the reader can read, edit, copy them into a new highlight
 * or delete them.
 */
function RelocatedNotes({
  highlights,
  bookmarks,
  onEdit,
  onDeleteBookmark,
}: {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onEdit: (h: Highlight) => void;
  onDeleteBookmark: (b: Bookmark) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-6 rounded-card border border-warning bg-warning-soft p-3">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-bold">
        <MovedIcon size={18} className="shrink-0" />
        یادداشت‌های جابه‌جا شده
        <span className="rounded-full bg-surface px-1.5 text-xs">{formatNumber(highlights.length + bookmarks.length)}</span>
      </h3>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        نسخه تازه‌ای از این کتاب منتشر شده و جای این موارد در متن جدید پیدا نشد. متن و یادداشت شما محفوظ است.
      </p>
      <ul className="mt-3 space-y-2">
        {highlights.map((h) => (
          <li key={`h${h.id}`} className="flex items-stretch gap-1 rounded-control border border-line bg-surface">
            <div className="flex min-h-11 flex-1 items-start gap-2 p-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 size-3 shrink-0 rounded-full border border-line-strong"
                style={{ backgroundColor: SWATCH[h.color]?.swatch }}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-4 text-sm leading-6">{h.text}</span>
                {h.note && (
                  <span className="mt-1 flex items-start gap-1 text-xs leading-5 text-ink-muted">
                    <NoteIcon size={14} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-3">{h.note}</span>
                  </span>
                )}
                <span className="mt-1 block text-xs text-ink-muted">{relocatedHint(h, formatNumber)}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onEdit(h)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-2 text-xs font-bold text-primary hover:bg-primary-soft"
              aria-label="ویرایش یا حذف یادداشت جابه‌جا شده"
            >
              ویرایش
            </button>
          </li>
        ))}
        {bookmarks.map((b) => (
          <li key={`b${b.id}`} className="flex items-stretch gap-1 rounded-control border border-line bg-surface">
            <div className="flex min-h-11 flex-1 items-center gap-2 p-2.5">
              <BookmarkIcon size={18} filled className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">نشانک</span>
                {b.label && <span className="block truncate text-xs leading-5 text-ink-muted">{b.label}</span>}
                <span className="block text-xs text-ink-muted">{relocatedHint(b, formatNumber)}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onDeleteBookmark(b)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-danger hover:bg-danger-soft"
              aria-label="حذف نشانک جابه‌جا شده"
            >
              <TrashIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
