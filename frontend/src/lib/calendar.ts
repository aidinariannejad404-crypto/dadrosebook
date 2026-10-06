/**
 * Add-to-calendar (ج۵). The backend serves the .ics (Persian text, Jalali dates, an alarm) and the
 * Google links; this module only builds what the button needs, with a Google fallback for events
 * that arrive without links (fixtures, an older API).
 */
import type { ExamEvent } from "./types";

export type CalendarKind = "exam" | "registration";

/** Data the AddToCalendar button needs (serialisable: passed from server components). */
export interface CalendarEvent {
  id: number;
  name: string;
  /** exam type slug, for analytics */
  exam: string;
  date: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  google: { exam: string; registration: string | null };
}

/** "2026-11-05" → "20261105" */
export function icsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** ISO date + n days (UTC, no DST drift). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Google Calendar "create event" link for an all-day range [start, lastDay]. */
export function googleCalendarUrl(e: { title: string; start: string; lastDay?: string; details?: string }): string {
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(addDays(e.lastDay ?? e.start, 1))}`,
  });
  if (e.details) qs.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

export function hasRegistration(e: Pick<CalendarEvent, "registrationStart" | "registrationEnd">): boolean {
  return Boolean(e.registrationStart && e.registrationEnd);
}

/** API ExamEvent → CalendarEvent (Google links from the API, else built here). */
export function toCalendarEvent(e: ExamEvent): CalendarEvent {
  const start = e.registration_start ?? null;
  const end = e.registration_end ?? null;
  const reg = start && end;
  return {
    id: e.id,
    name: e.name,
    exam: e.exam_type.slug,
    date: e.date,
    registrationStart: reg ? start : null,
    registrationEnd: reg ? end : null,
    google: {
      exam: e.calendar?.exam.google ?? googleCalendarUrl({ title: e.name, start: e.date }),
      registration: reg
        ? (e.calendar?.registration?.google ?? googleCalendarUrl({ title: `ثبت‌نام ${e.name}`, start, lastDay: end }))
        : null,
    },
  };
}
