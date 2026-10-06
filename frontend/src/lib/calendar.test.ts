import { describe, expect, it } from "vitest";
import { addDays, googleCalendarUrl, hasRegistration, icsDate, toCalendarEvent } from "./calendar";
import type { ExamEvent } from "./types";

const base: ExamEvent = {
  id: 7,
  name: "آزمون وکالت ۱۴۰۵",
  date: "2026-11-05",
  exam_type: { id: 1, name: "کانون وکلا", slug: "kanoon", short_name: "کانون" },
};

describe("calendar", () => {
  it("formats dates and adds days across month ends", () => {
    expect(icsDate("2026-11-05")).toBe("20261105");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds an all-day Google link with an exclusive end", () => {
    const url = new URL(googleCalendarUrl({ title: "آزمون", start: "2026-11-05" }));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261105/20261106");
    expect(url.searchParams.get("text")).toBe("آزمون");
    const reg = new URL(googleCalendarUrl({ title: "ثبت‌نام", start: "2026-08-23", lastDay: "2026-09-01", details: "x" }));
    expect(reg.searchParams.get("dates")).toBe("20260823/20260902");
    expect(reg.searchParams.get("details")).toBe("x");
  });

  it("maps API events, preferring the API's links", () => {
    const fallback = toCalendarEvent(base);
    expect(fallback.google.exam).toContain("dates=20261105%2F20261106");
    expect(fallback.google.registration).toBeNull();
    expect(hasRegistration(fallback)).toBe(false);

    const full = toCalendarEvent({
      ...base,
      registration_start: "2026-08-23",
      registration_end: "2026-09-01",
      calendar: { exam: { google: "https://g/exam" }, registration: { google: "https://g/reg" } },
    });
    expect(full.google).toEqual({ exam: "https://g/exam", registration: "https://g/reg" });
    expect(hasRegistration(full)).toBe(true);
    expect(full.exam).toBe("kanoon");

    // half a window counts as none
    expect(toCalendarEvent({ ...base, registration_start: "2026-08-23" }).registrationStart).toBeNull();
  });
});
