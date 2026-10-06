/**
 * Retention stream (UX research ه۲–ه۵، ه۷): reading minutes, daily goal, gentle streak,
 * time-left estimates, the living study plan and the review prompt.
 * API: `/api/v1/study/…` (backend `apps.study`). Pure helpers here are unit-tested.
 */
import { toPersianDigits } from "./format";

/* ---------- types (API shapes) ---------- */

export interface StreakInfo {
  current: number;
  today_met: boolean;
  rest_days_left: number;
  rest_days_used: number;
  rest_days_per_week: number;
  milestone: 7 | 30 | null;
}

export interface Pace {
  pages_per_minute: number;
  minutes_per_page: number;
  measured: boolean;
  basis: "book" | "all" | "default";
}

export interface HeartbeatReply {
  credited_seconds: number;
  minutes: number;
  seconds: number;
  goal_minutes: number;
  goal_met: boolean;
  just_met: boolean;
  streak: StreakInfo;
  pace: Pace;
}

export interface GoalState {
  date: string;
  minutes: number;
  seconds: number;
  goal_minutes: number;
  goal_met: boolean;
  streak: StreakInfo;
  daily_goal_minutes: number;
  review_sms: boolean;
  goal_choices: number[];
}

export interface ReportDay {
  date: string;
  weekday: string;
  minutes: number;
  goal_minutes: number;
  met: boolean;
  is_today: boolean;
  is_future: boolean;
}

export interface ReportSubject {
  id: number | null;
  name: string;
  slug: string;
  color: string | null;
  minutes: number;
  target_minutes: number | null;
}

export interface StudyReport {
  week_start: string;
  week_end: string;
  today: string;
  daily_goal_minutes: number;
  weekly_goal_minutes: number;
  total_minutes: number;
  goal_days_met: number;
  days: ReportDay[];
  subjects: ReportSubject[];
  streak: StreakInfo;
  pace: Pace;
  books_finished: { slug: string; title: string; finished_at: string }[];
  books_finished_this_week: number;
  all_time_minutes: number;
}

export interface BookForecast {
  finished: boolean;
  remaining_pages: number;
  minutes_left: number;
  daily_minutes?: number;
  days_to_finish: number;
  finish_date: string;
  /** > 0: finishes that many days before the exam; ≤ 0: not in time; null: no exam known */
  margin_days: number | null;
  basis: "history" | "goal" | "done";
  pace: Pace;
}

export interface ForecastPayload {
  exam: { name: string; date: string } | null;
  books: Record<string, BookForecast>;
}

export interface PlanSubject {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface LivingPlanItem {
  subject: PlanSubject | null;
  book_title: string;
  book_slug: string;
  pages_from: number;
  pages_to: number;
  task: string;
  done: boolean;
  rescheduled?: boolean;
}

export interface LivingPlanDay {
  date: string;
  items: LivingPlanItem[];
  done: boolean;
}

export interface LivingPlan {
  id: number;
  exam: { name: string; date: string; days_left: number } | null;
  hours_per_day: number;
  lead_token: string | null;
  compressed_count: number;
  books: {
    slug: string;
    title: string;
    subject: PlanSubject | null;
    total_pages: number;
    pages_done: number;
    has_ebook_progress: boolean;
  }[];
  status: {
    behind_days: number;
    pages_behind: number;
    total_pages: number;
    pages_done: number;
    percent: number;
    can_compress: boolean;
  };
  today: {
    date: string;
    day: LivingPlanDay | null;
    review: { date: string; task: string } | null;
    next_day: LivingPlanDay | null;
  };
  days?: LivingPlanDay[];
  review?: { date: string; task: string }[];
}

export interface UpgradeOffer {
  percent: number;
  old_book: { title: string; slug: string; edition_label: string };
  message: string;
}

export interface ReviewPromptItem {
  id: number;
  reason: "DELIVERED" | "READ";
  book: { slug: string; title: string };
  exam_type: { slug: string; name: string } | null;
}

/* ---------- routes ---------- */

export const studyRoutes = {
  report: "/account/report",
  plan: "/account/plan",
} as const;

/* ---------- heartbeat gating (R7: only active, visible reading counts) ---------- */

export const HEARTBEAT_MS = 30_000;
/** interaction older than this pauses the minutes (reader walked away) */
export const IDLE_MS = 120_000;

/**
 * Seconds to report for the interval that just ended, or 0 to skip the beat.
 * Counts only while the page is visible and the reader interacted within IDLE_MS; never more than
 * the time since the last beat (the server clamps too).
 */
export function activeSeconds(
  now: number,
  lastInteraction: number,
  lastBeat: number,
  visible: boolean,
  online = true,
): number {
  if (!visible || !online) return 0;
  if (now - lastInteraction > IDLE_MS) return 0;
  const since = Math.round((now - lastBeat) / 1000);
  return Math.max(0, Math.min(since, 60));
}

/* ---------- copy (never shaming) ---------- */

export function minutesText(min: number): string {
  if (min < 60) return `${toPersianDigits(min)} دقیقه`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه` : `${toPersianDigits(h)} ساعت`;
}

/** 0–100 share of the goal (capped), for rings and bars. */
export function goalPercent(minutes: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((minutes / goal) * 100)));
}

/** One encouraging line for today's goal state. */
export function goalLine(minutes: number, goal: number, met: boolean): string {
  if (met) return "هدف امروز انجام شد؛ هرچه بیشتر بخوانید، هدیه است.";
  if (minutes <= 0) return `امروز با ${toPersianDigits(Math.min(goal, 10))} دقیقه شروع کنید؛ همین هم حساب است.`;
  const left = Math.max(1, goal - minutes);
  return `${toPersianDigits(left)} دقیقه تا هدف امروز.`;
}

/** Streak headline: celebrates days kept, explains rest days, never blames. */
export function streakLine(s: StreakInfo): string {
  if (s.current <= 0) return "زنجیره مطالعه از اولین روزی که به هدف برسید شروع می‌شود.";
  const days = `${toPersianDigits(s.current)} روز مطالعه پیاپی`;
  if (s.today_met) return `${days}؛ امروز هم ثبت شد.`;
  if (s.rest_days_left > 0) {
    return `${days}. اگر امروز نرسیدید، یکی از ${toPersianDigits(s.rest_days_left)} روز استراحت این هفته است.`;
  }
  return `${days}. استراحت‌های این هفته استفاده شده؛ چند دقیقه مطالعه امروز زنجیره را نگه می‌دارد.`;
}

export function milestoneText(m: 7 | 30): string {
  return m === 7
    ? "۷ روز مطالعه پیاپی! ریتمی ساخته‌اید که تا روز آزمون همراهتان است."
    : "۳۰ روز مطالعه پیاپی! یک ماه کامل؛ این پشتکار در جلسه آزمون پیداست.";
}

/* ---------- time left (ه۴) ---------- */

/** Minutes to read `pages` at `pagesPerMinute` (≥ 1 when there is anything left). */
export function minutesForPages(pages: number, pagesPerMinute: number): number {
  if (pages <= 0 || pagesPerMinute <= 0) return 0;
  return Math.max(1, Math.ceil(pages / pagesPerMinute));
}

/** «حدود ۱۸ دقیقه تا پایان فصل» (scope: chapter or book). */
export function timeLeftText(minutes: number, scope: "chapter" | "book"): string {
  const where = scope === "chapter" ? "پایان فصل" : "پایان کتاب";
  if (minutes <= 0) return `به ${where} رسیدید`;
  if (minutes < 2) return `کمتر از ۲ دقیقه تا ${where}`;
  return `حدود ${minutesText(minutes)} تا ${where}`;
}

/** Library card line: «با سرعت فعلی، ۱۲ روز پیش از آزمون تمام می‌شود» or an honest warning. */
export function forecastLine(f: BookForecast, examName?: string | null): { text: string; tone: "ok" | "warn" | "info" } {
  if (f.finished) return { text: "این کتاب را تمام کرده‌اید.", tone: "ok" };
  const days = toPersianDigits(f.days_to_finish);
  if (f.margin_days == null) {
    return {
      text:
        f.basis === "goal"
          ? `با هدف روزانه‌تان حدود ${days} روز دیگر تمام می‌شود.`
          : `با سرعت فعلی، حدود ${days} روز دیگر تمام می‌شود.`,
      tone: "info",
    };
  }
  const exam = examName ? `«${examName}»` : "آزمون";
  if (f.margin_days > 0) {
    const pre = f.basis === "goal" ? "با هدف روزانه‌تان" : "با سرعت فعلی";
    return { text: `${pre}، ${toPersianDigits(f.margin_days)} روز پیش از ${exam} تمام می‌شود.`, tone: "ok" };
  }
  if (f.margin_days === 0) return { text: `با سرعت فعلی، درست روز ${exam} تمام می‌شود؛ کمی بیشتر بخوانید.`, tone: "warn" };
  const available = f.days_to_finish + f.margin_days - 1; // days from today to the exam
  if (available <= 0) {
    return { text: `تا ${exam} فرصت خواندن کامل نیست؛ روی مرور و سریع‌خوان تمرکز کنید.`, tone: "warn" };
  }
  const perDay = minutesText(Math.ceil(f.minutes_left / available));
  return { text: `با سرعت فعلی پیش از ${exam} تمام نمی‌شود؛ برای رسیدن، روزی ${perDay} لازم است.`, tone: "warn" };
}

/* ---------- plan ---------- */

export function planItemKey(i: Pick<LivingPlanItem, "book_slug" | "pages_from" | "pages_to">): string {
  return `${i.book_slug}:${i.pages_from}-${i.pages_to}`;
}

export function pagesLabel(from: number, to: number): string {
  return from === to ? `صفحه ${toPersianDigits(from)}` : `صفحه ${toPersianDigits(from)} تا ${toPersianDigits(to)}`;
}

export function behindLine(days: number): string {
  return `${toPersianDigits(days)} روز از برنامه عقب هستید؛ برنامه را تا روز آزمون فشرده کنیم؟`;
}

/** Last page of the chapter containing `page`, from sorted chapter start pages (null: no chapters). */
export function chapterEndFor(starts: number[], page: number, total: number): number | null {
  const sorted = [...new Set(starts.filter((p) => p >= 1 && p <= total))].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const next = sorted.find((p) => p > page);
  return next != null ? next - 1 : total;
}
