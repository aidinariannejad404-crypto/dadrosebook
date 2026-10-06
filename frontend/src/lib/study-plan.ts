import type { BookDetail, Course, ExamEvent, StudyPlan, StudyPlanDay } from "./types";
import { daysLeft, tehranToday } from "./exam-time";

/** Persian weeks start on Saturday (شنبه). */
const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Saturday on or before the date, as "YYYY-MM-DD". */
export function weekStart(iso: string): string {
  const t = utcDay(iso);
  const sinceSaturday = (new Date(t).getUTCDay() + 1) % 7; // Sat=0 … Fri=6
  return isoOf(t - sinceSaturday * DAY_MS);
}

export interface PlanWeek {
  /** 1-based */
  index: number;
  /** Saturday of the week */
  start: string;
  days: StudyPlanDay[];
}

/** Group plan days into Saturday-based weeks, keeping order; days must be ascending. */
export function groupByWeek(days: StudyPlanDay[]): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (const day of days) {
    const start = weekStart(day.date);
    let week = weeks[weeks.length - 1];
    if (!week || week.start !== start) {
      week = { index: weeks.length + 1, start, days: [] };
      weeks.push(week);
    }
    week.days.push(day);
  }
  return weeks;
}

/* ---------- API errors (POST /leads/study-plan/) ---------- */

export type StudyPlanField = "phone" | "exam_type" | "subjects" | "books" | "hours_per_day" | "consent" | "form";

const FALLBACK: Record<number, string> = {
  429: "تعداد درخواست‌ها از این دستگاه زیاد بوده است. لطفاً کمی بعد دوباره تلاش کنید.",
  500: "خطایی در سرور رخ داد. لطفاً چند دقیقه بعد دوباره تلاش کنید.",
};
const KNOWN: StudyPlanField[] = ["phone", "exam_type", "subjects", "books", "hours_per_day", "consent"];

/** Has Persian/Arabic letters, i.e. safe to show as-is to a Persian reader. */
const PERSIAN = /[؀-ۿ]/;

/** Map an error response to per-field Persian messages ("form" for general errors). */
export function studyPlanErrors(status: number, body: unknown): Partial<Record<StudyPlanField, string>> {
  const out: Partial<Record<StudyPlanField, string>> = {};
  if (status === 400 && body && typeof body === "object") {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const first = Array.isArray(value) ? value[0] : value;
      const field: StudyPlanField = (KNOWN as string[]).includes(key) ? (key as StudyPlanField) : "form";
      const msg = typeof first === "string" && PERSIAN.test(first) ? first : DEFAULT_FIELD[field];
      out[field] ??= msg;
    }
    if (Object.keys(out).length) return out;
  }
  return { form: FALLBACK[status] ?? (status >= 500 ? FALLBACK[500] : "ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید.") };
}

const DEFAULT_FIELD: Record<StudyPlanField, string> = {
  phone: "شماره موبایل معتبر نیست.",
  exam_type: "آزمون را انتخاب کنید.",
  subjects: "دست‌کم یک درس را انتخاب کنید.",
  books: "کتاب انتخاب‌شده معتبر نیست.",
  hours_per_day: "ساعت مطالعه روزانه را بین ۲ تا ۱۰ انتخاب کنید.",
  consent: "برای دریافت برنامه، موافقت با دریافت پیامک لازم است.",
  form: "ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید.",
};

/* ---------- fixture plan (USE_API_FIXTURES=1) ---------- */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stand-in for GET /leads/study-plan/<token>/: spreads the pages of the civil-law books over the days
 * left (last 5 days are review), like the backend generator. Any UUID token works; others → null.
 */
export function fixtureStudyPlan(
  token: string,
  now: number,
  books: BookDetail[],
  exam: ExamEvent | null,
  courses: Course[],
): StudyPlan | null {
  if (!UUID_RE.test(token)) return null;
  const today = tehranToday(now);
  const left = exam ? daysLeft(exam.date, now) : null;
  // calendar days from today to the day before the exam (today counts as a study day)
  const calendar = exam ? Math.round((utcDay(exam.date) - utcDay(today)) / DAY_MS) : null;
  const totalDays = calendar != null && calendar > 7 ? calendar : 33;
  const reviewDays = Math.min(5, Math.max(2, Math.round(totalDays / 7)));
  const studyDays = totalDays - reviewDays;
  const picks = books.filter((b) => b.pages > 0).slice(0, 3);
  const totalPages = picks.reduce((s, b) => s + b.pages, 0);
  const perDay = Math.max(1, Math.ceil(totalPages / studyDays));

  const days: StudyPlanDay[] = [];
  let bookIdx = 0;
  let page = 1;
  for (let d = 0; d < studyDays && bookIdx < picks.length; d++) {
    const items: StudyPlanDay["items"] = [];
    let budget = perDay;
    while (budget > 0 && bookIdx < picks.length) {
      const book = picks[bookIdx]!;
      const to = Math.min(book.pages, page + budget - 1);
      items.push({
        subject: book.subjects[0]!,
        book_title: book.title,
        book_slug: book.slug,
        pages_from: page,
        pages_to: to,
        task: d % 7 === 6 ? "مطالعه و تست فصل" : "مطالعه",
      });
      budget -= to - page + 1;
      if (to >= book.pages) {
        bookIdx++;
        page = 1;
      } else page = to + 1;
    }
    days.push({ date: isoOf(utcDay(today) + d * DAY_MS), items });
  }
  const subjectNames = [...new Set(picks.map((b) => b.subjects[0]!.name))];
  const review = Array.from({ length: reviewDays }, (_, i) => ({
    date: isoOf(utcDay(today) + (studyDays + i) * DAY_MS),
    task:
      i === reviewDays - 1
        ? "استراحت سبک و مرور یادداشت‌ها"
        : `جمع‌بندی و تست ${subjectNames[i % subjectNames.length] ?? "دروس"}`,
  }));
  return {
    token,
    created_at: new Date(now).toISOString(),
    phone_masked: "0912***4567",
    exam: exam && left != null ? { name: exam.name, date: exam.date, days_left: left } : null,
    hours_per_day: 6,
    summary: { total_pages: totalPages, study_days: days.length, review_days: reviewDays, pages_per_day: perDay },
    days,
    review,
    recommended_courses: courses.slice(0, 3),
  };
}
