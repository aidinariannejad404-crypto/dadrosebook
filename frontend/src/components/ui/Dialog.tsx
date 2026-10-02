"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./Icons";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider layout (e.g. sample pages viewer). */
  size?: "sm" | "lg";
  onKeyDown?: (e: React.KeyboardEvent<HTMLDialogElement>) => void;
}

/**
 * Accessible modal built on the native <dialog> element (focus containment, Esc, inert background).
 * Focus returns to the opener automatically when the dialog closes.
 */
export function Dialog({ open, onClose, title, children, size = "sm", onKeyDown }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // click on the backdrop (outside the panel) closes
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-card bg-surface p-0 text-ink shadow-raised backdrop:bg-[color-mix(in_srgb,var(--color-text)_60%,transparent)] ${
        size === "lg" ? "max-w-3xl" : "max-w-md"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id={titleId} className="text-base font-bold">
          {title}
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
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
