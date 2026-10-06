"use client";

import { useState } from "react";
import { COMPARE_MAX, type CompareItem } from "@/lib/compare";
import { toPersianDigits } from "@/lib/format";
import { useCompareTray } from "./compare-store";

export function CompareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.5" />
      <path d="M6 8h2M16 8h2M6 11.5h2M16 11.5h2" />
    </svg>
  );
}

interface CompareToggleProps {
  book: CompareItem;
  /** "icon": round overlay on cards; "button": labelled button (product page) */
  variant?: "icon" | "button";
  className?: string;
}

/** «افزودن به مقایسه» (د۶): adds the book to the floating compare tray (max 3). */
export function CompareToggle({ book, variant = "icon", className = "" }: CompareToggleProps) {
  const { items, toggle } = useCompareTray();
  const [message, setMessage] = useState("");
  const on = items.some((i) => i.id === book.id);

  function onClick() {
    const { full } = toggle(book, !on);
    setMessage(
      full
        ? `حداکثر ${toPersianDigits(COMPARE_MAX)} کتاب را می‌توانید مقایسه کنید؛ یکی را از نوار مقایسه بردارید.`
        : on
          ? "از مقایسه برداشته شد."
          : "به مقایسه اضافه شد.",
    );
  }

  const label = on ? `برداشتن «${book.title}» از مقایسه` : `افزودن «${book.title}» به مقایسه`;
  return (
    <span className={className}>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={on}
          aria-label={label}
          title={on ? "در فهرست مقایسه" : "مقایسه"}
          className={`press inline-flex size-11 items-center justify-center rounded-full shadow-card ${
            on ? "bg-primary text-white" : "bg-surface text-ink-muted hover:text-primary"
          }`}
        >
          <CompareIcon size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={on}
          className={`press inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${
            on ? "border-primary bg-primary-soft text-primary" : "border-line-strong bg-surface text-ink-muted hover:text-primary"
          }`}
        >
          <CompareIcon size={18} />
          {on ? "در مقایسه" : "مقایسه"}
        </button>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </span>
  );
}
