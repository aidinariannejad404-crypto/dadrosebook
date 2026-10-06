import { describe, expect, it } from "vitest";
import {
  IDLE_MS,
  activeSeconds,
  behindLine,
  chapterEndFor,
  forecastLine,
  goalLine,
  goalPercent,
  minutesForPages,
  minutesText,
  pagesLabel,
  planItemKey,
  streakLine,
  timeLeftText,
  type BookForecast,
  type StreakInfo,
} from "./study";

const pace = { pages_per_minute: 0.5, minutes_per_page: 2, measured: false, basis: "default" as const };

function forecast(over: Partial<BookForecast>): BookForecast {
  return {
    finished: false,
    remaining_pages: 100,
    minutes_left: 200,
    days_to_finish: 10,
    finish_date: "2026-10-14",
    margin_days: 12,
    basis: "history",
    pace,
    ...over,
  };
}

function streak(over: Partial<StreakInfo>): StreakInfo {
  return { current: 0, today_met: false, rest_days_left: 2, rest_days_used: 0, rest_days_per_week: 2, milestone: null, ...over };
}

describe("activeSeconds (heartbeat gating)", () => {
  const now = 1_000_000;
  it("counts the interval while visible and recently active", () => {
    expect(activeSeconds(now, now - 5_000, now - 30_000, true)).toBe(30);
  });
  it("skips hidden pages, idle readers and offline sessions", () => {
    expect(activeSeconds(now, now - 5_000, now - 30_000, false)).toBe(0);
    expect(activeSeconds(now, now - IDLE_MS - 1, now - 30_000, true)).toBe(0);
    expect(activeSeconds(now, now - 5_000, now - 30_000, true, false)).toBe(0);
  });
  it("never reports more than 60 s", () => {
    expect(activeSeconds(now, now - 1_000, now - 600_000, true)).toBe(60);
  });
});

describe("goal and streak copy", () => {
  it("formats minutes and percent", () => {
    expect(minutesText(45)).toBe("۴۵ دقیقه");
    expect(minutesText(60)).toBe("۱ ساعت");
    expect(minutesText(95)).toBe("۱ ساعت و ۳۵ دقیقه");
    expect(goalPercent(10, 20)).toBe(50);
    expect(goalPercent(40, 20)).toBe(100);
    expect(goalPercent(5, 0)).toBe(0);
  });
  it("is encouraging, never shaming", () => {
    expect(goalLine(0, 20, false)).toContain("شروع کنید");
    expect(goalLine(12, 20, false)).toBe("۸ دقیقه تا هدف امروز.");
    expect(goalLine(25, 20, true)).toContain("انجام شد");
    const lines = [
      streakLine(streak({})),
      streakLine(streak({ current: 5 })),
      streakLine(streak({ current: 5, today_met: true })),
      streakLine(streak({ current: 5, rest_days_left: 0 })),
    ];
    expect(lines[1]).toContain("روز استراحت");
    for (const l of lines) expect(l).not.toMatch(/شکست|از دست دادید|تنبل/);
  });
});

describe("time left", () => {
  it("rounds up to whole minutes", () => {
    expect(minutesForPages(9, 0.5)).toBe(18);
    expect(minutesForPages(1, 5)).toBe(1);
    expect(minutesForPages(0, 1)).toBe(0);
  });
  it("says chapter or book", () => {
    expect(timeLeftText(18, "chapter")).toBe("حدود ۱۸ دقیقه تا پایان فصل");
    expect(timeLeftText(1, "book")).toBe("کمتر از ۲ دقیقه تا پایان کتاب");
    expect(timeLeftText(0, "chapter")).toBe("به پایان فصل رسیدید");
  });
  it("finds the chapter's last page", () => {
    expect(chapterEndFor([1, 10, 25], 12, 40)).toBe(24);
    expect(chapterEndFor([1, 10, 25], 30, 40)).toBe(40);
    expect(chapterEndFor([1], 5, 40)).toBeNull();
    expect(chapterEndFor([], 5, 40)).toBeNull();
  });
});

describe("library forecast line", () => {
  it("finishes before the exam", () => {
    expect(forecastLine(forecast({ margin_days: 12 }), "آزمون کانون").text).toBe(
      "با سرعت فعلی، ۱۲ روز پیش از «آزمون کانون» تمام می‌شود.",
    );
  });
  it("warns with the minutes a day needed", () => {
    // 10 days to finish, 4 days late → 5 days available → 40 min a day
    const line = forecastLine(forecast({ margin_days: -4 }), null);
    expect(line.tone).toBe("warn");
    expect(line.text).toContain("۴۰ دقیقه");
  });
  it("has no exam and goal-based wording", () => {
    expect(forecastLine(forecast({ margin_days: null, basis: "goal" })).text).toBe(
      "با هدف روزانه‌تان حدود ۱۰ روز دیگر تمام می‌شود.",
    );
    expect(forecastLine(forecast({ finished: true })).tone).toBe("ok");
  });
});

describe("plan helpers", () => {
  it("labels and keys items", () => {
    expect(pagesLabel(3, 3)).toBe("صفحه ۳");
    expect(pagesLabel(1, 20)).toBe("صفحه ۱ تا ۲۰");
    expect(planItemKey({ book_slug: "مدنی", pages_from: 1, pages_to: 20 })).toBe("مدنی:1-20");
    expect(behindLine(3)).toBe("۳ روز از برنامه عقب هستید؛ برنامه را تا روز آزمون فشرده کنیم؟");
  });
});
