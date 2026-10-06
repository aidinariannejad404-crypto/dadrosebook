"use client";

import { useEffect, useId, useRef, useState } from "react";
import { READER_THEMES, type ReaderTheme } from "./theme";

const SWATCH: Record<ReaderTheme, { paper: string; ink: string }> = {
  light: { paper: "var(--reader-paper-light)", ink: "var(--reader-ink-light)" },
  sepia: { paper: "var(--reader-paper-sepia)", ink: "var(--reader-ink-sepia)" },
  dark: { paper: "var(--reader-paper-dark)", ink: "var(--reader-ink-dark)" },
};

function Swatch({ theme, size = 28 }: { theme: ReaderTheme; size?: number }) {
  const s = SWATCH[theme];
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-line-strong text-xs font-black leading-none"
      style={{ width: size, height: size, backgroundColor: s.paper, color: s.ink }}
    >
      الف
    </span>
  );
}

function ThemeButtons({ value, onChange, labelled }: { value: ReaderTheme; onChange: (t: ReaderTheme) => void; labelled: boolean }) {
  return (
    <>
      {READER_THEMES.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.value)}
            title={labelled ? undefined : `پس‌زمینه ${t.label}`}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-1.5 text-sm font-bold ${
              on ? "bg-primary-soft text-ink ring-2 ring-inset ring-accent" : "text-ink-muted hover:bg-primary-soft"
            } ${labelled ? "flex-1 px-3" : ""}`}
          >
            <Swatch theme={t.value} />
            {labelled ? t.label : <span className="sr-only">{`پس‌زمینه ${t.label}`}</span>}
          </button>
        );
      })}
    </>
  );
}

/**
 * Light / sepia / dark switch for the reader. Desktop: an inline button group in the top bar.
 * Mobile: one «نمایش» button that opens the same group in a panel under the bar (Escape closes).
 */
export function ReaderThemeToggle({ value, onChange }: { value: ReaderTheme; onChange: (t: ReaderTheme) => void }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <div role="group" aria-label="رنگ پس‌زمینه کتاب" className="hidden items-center gap-0.5 md:flex">
        <ThemeButtons value={value} onChange={onChange} labelled={false} />
      </div>

      <div ref={wrapRef} className="md:hidden">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-primary hover:bg-primary-soft"
        >
          <Swatch theme={value} size={26} />
          <span className="sr-only">رنگ پس‌زمینه کتاب</span>
        </button>
        <div
          id={panelId}
          hidden={!open}
          className="absolute inset-x-2 top-full z-50 mt-1 rounded-card border border-line bg-surface p-2 shadow-raised"
        >
          <p className="px-1 pb-1.5 text-xs font-bold text-ink-muted">رنگ پس‌زمینه کتاب</p>
          <div role="group" aria-label="رنگ پس‌زمینه کتاب" className="flex gap-1">
            <ThemeButtons value={value} onChange={onChange} labelled />
          </div>
        </div>
      </div>
    </>
  );
}

/** The labelled light / sepia / dark choice (EPUB settings sheet). */
export function ReaderThemeChoices({ value, onChange }: { value: ReaderTheme; onChange: (t: ReaderTheme) => void }) {
  return (
    <div role="group" aria-label="رنگ پس‌زمینه کتاب" className="flex gap-1">
      <ThemeButtons value={value} onChange={onChange} labelled />
    </div>
  );
}
