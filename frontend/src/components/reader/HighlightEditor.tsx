"use client";

import { useEffect, useId, useState } from "react";
import { HIGHLIGHT_COLORS, MAX_HIGHLIGHT_TEXT } from "@/lib/reader";
import type { HighlightColor } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { CheckIcon } from "@/components/ui/Icons";

interface HighlightEditorProps {
  open: boolean;
  mode: "create" | "edit";
  quote: string;
  initialColor: HighlightColor;
  initialNote: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (v: { color: HighlightColor; note: string }) => void;
  onDelete?: () => void;
}

/** Note + colour editor for a new selection («یادداشت») or an existing highlight. */
export function HighlightEditor({
  open,
  mode,
  quote,
  initialColor,
  initialNote,
  busy = false,
  onClose,
  onSave,
  onDelete,
}: HighlightEditorProps) {
  const [color, setColor] = useState<HighlightColor>(initialColor);
  const [note, setNote] = useState(initialNote);
  const noteId = useId();

  useEffect(() => {
    if (open) {
      setColor(initialColor);
      setNote(initialNote);
    }
  }, [open, initialColor, initialNote]);

  return (
    <Dialog open={open} onClose={onClose} title={mode === "create" ? "یادداشت برای متن انتخاب‌شده" : "ویرایش هایلایت"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ color, note: note.trim() });
        }}
        className="space-y-4"
      >
        <blockquote className="max-h-32 overflow-y-auto border-s-4 border-accent ps-3 text-sm leading-7 text-ink-muted">
          {quote}
        </blockquote>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">رنگ</legend>
          <div className="flex gap-2">
            {HIGHLIGHT_COLORS.map((c) => (
              <label
                key={c.value}
                className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name="highlight-color"
                  value={c.value}
                  checked={color === c.value}
                  onChange={() => setColor(c.value)}
                  className="sr-only"
                />
                <span className="sr-only">{c.label}</span>
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full border-2 border-line-strong text-ink"
                  style={{ backgroundColor: c.swatch }}
                >
                  {color === c.value && <CheckIcon size={18} />}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={noteId} className="mb-2 block text-sm font-bold">
            یادداشت
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_HIGHLIGHT_TEXT}
            rows={4}
            placeholder="برداشت یا نکته خود را بنویسید…"
            className="w-full rounded-control border border-line bg-bg p-3 text-base leading-7 text-ink placeholder:text-ink-muted focus:border-primary focus:bg-surface"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {mode === "create" ? "ذخیره هایلایت" : "ذخیره تغییرات"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-control px-4 font-bold text-ink hover:bg-primary-soft"
          >
            انصراف
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="ms-auto inline-flex min-h-11 items-center justify-center rounded-control px-4 font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
            >
              حذف هایلایت
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
