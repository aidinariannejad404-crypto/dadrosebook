"use client";

import { useEffect, useId, useRef, useState } from "react";
import { examEventIcsUrl } from "@/lib/api";
import { trackAddToCalendar } from "@/lib/analytics";
import { hasRegistration, type CalendarEvent, type CalendarKind } from "@/lib/calendar";
import { formatJalaliDate } from "@/lib/format";
import { CalendarIcon } from "@/components/ui/Icons";

interface AddToCalendarProps {
  event: CalendarEvent;
  /** where the button sits (analytics): "countdown", "kit", … */
  placement: string;
  /** light text on the navy countdown bar */
  tone?: "dark" | "light";
  className?: string;
}

/**
 * «افزودن به تقویم» (ج۵): a small menu with the exam day and, when known, the registration window,
 * each as an .ics download (iPhone / Android calendar apps) or a Google Calendar link.
 */
export function AddToCalendar({ event, placement, tone = "light", className = "" }: AddToCalendarProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const reg = hasRegistration(event);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sent = (kind: CalendarKind, via: "ics" | "google") => {
    trackAddToCalendar({ kind, via, exam_type: event.exam, placement });
    setOpen(false);
  };

  const trigger =
    tone === "dark"
      ? "text-accent hover:bg-white/10"
      : "border border-line-strong bg-surface text-primary hover:bg-primary-soft";
  const item =
    "press flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-bold text-ink hover:bg-primary-soft";

  const block = (kind: CalendarKind, title: string, note: string, google: string) => (
    <div className="py-1">
      <p className="px-3 pt-1 text-xs font-extrabold text-ink-muted">
        {title} <span className="font-normal">· {note}</span>
      </p>
      <a href={examEventIcsUrl(event.id, kind)} download onClick={() => sent(kind, "ics")} className={item}>
        فایل تقویم گوشی
        <span className="text-xs font-normal text-ink-muted">(آیفون، اندروید)</span>
      </a>
      <a href={google} target="_blank" rel="noopener" onClick={() => sent(kind, "google")} className={item}>
        Google Calendar
        <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
      </a>
    </div>
  );

  return (
    <div ref={wrap} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((o) => !o)}
        className={`press inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold ${trigger}`}
      >
        <CalendarIcon size={18} className="shrink-0" />
        افزودن به تقویم
      </button>
      <div
        id={`${id}-menu`}
        hidden={!open}
        className="motion-pop-in absolute end-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] divide-y divide-line rounded-card border border-line bg-surface p-1 text-start shadow-raised"
      >
        {block("exam", "روز آزمون", formatJalaliDate(event.date), event.google.exam)}
        {reg &&
          event.registrationStart &&
          event.registrationEnd &&
          event.google.registration &&
          block(
            "registration",
            "مهلت ثبت‌نام",
            `${formatJalaliDate(event.registrationStart, "d MMMM")} تا ${formatJalaliDate(event.registrationEnd, "d MMMM")}`,
            event.google.registration,
          )}
      </div>
    </div>
  );
}
