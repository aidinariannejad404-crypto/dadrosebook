"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClockIcon } from "@/components/ui/Icons";
import { examCountdown } from "@/lib/countdown";
import { toPersianDigits } from "@/lib/format";
import type { CalendarEvent } from "@/lib/calendar";
import { AddToCalendar } from "@/components/calendar/AddToCalendar";

interface CountdownBarProps {
  examName: string;
  /** ISO date of the exam, e.g. "2026-11-05" */
  examDate: string;
  /** Jalali date label pre-rendered on the server */
  examDateLabel: string;
  /** server timestamp used for the first (hydration) render */
  serverNow: number;
  /** ج۵: «افزودن به تقویم» (exam day + registration window) */
  calendar?: CalendarEvent | null;
}

/**
 * Countdown to the next exam. The first render uses the server's clock (identical markup on
 * server and client → no hydration mismatch); after mount it switches to the live clock.
 */
export function CountdownBar({ examName, examDate, examDateLabel, serverNow, calendar = null }: CountdownBarProps) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { days, hours, past } = examCountdown(examDate, now);
  if (past) return null;

  return (
    <div className="bg-primary text-white">
      <div className="mx-auto flex max-w-site flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm md:justify-between">
        <p className="flex items-center gap-2">
          <ClockIcon size={18} className="shrink-0 text-accent" />
          <span>
            <span className="font-bold">{examName}</span>
            <span className="text-white/80"> · {examDateLabel}</span>
          </span>
        </p>
        <p className="flex items-center gap-2" aria-live="off">
          <span className="text-white/85">زمان باقی‌مانده:</span>
          <span className="rounded-md bg-accent px-2 py-0.5 font-extrabold text-ink">
            {toPersianDigits(days)} روز
          </span>
          <span className="rounded-md bg-white/15 px-2 py-0.5 font-bold">{toPersianDigits(hours)} ساعت</span>
          <Link prefetch={false} href="/kit" className="hidden min-h-11 items-center px-2 font-bold text-accent underline-offset-4 hover:underline md:inline-flex">
            بسته مطالعاتی آزمون
          </Link>
          {calendar && <AddToCalendar event={calendar} placement="countdown" tone="dark" />}
        </p>
      </div>
    </div>
  );
}
