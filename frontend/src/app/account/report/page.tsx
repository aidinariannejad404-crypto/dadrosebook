import type { Metadata } from "next";
import Link from "next/link";
import { serverApiGet } from "@/lib/server-session";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { routes } from "@/lib/config";
import {
  goalLine,
  goalPercent,
  minutesText,
  streakLine,
  studyRoutes,
  type GoalState,
  type StudyReport,
} from "@/lib/study";
import { CelebrationBadge, GoalRing, StreakChip } from "@/components/study/GoalRing";
import { GoalEditor } from "@/components/study/GoalEditor";
import { BookOpenIcon, CalendarIcon, CheckIcon, ClockIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

/** Saturday → Friday initials (the week chart columns). */
const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const metadata: Metadata = { title: "کارنامه مطالعه", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * «کارنامه مطالعه» (ه۳ / L-4): this Persian week's minutes per day and per subject against the
 * goal, the gentle streak (2 rest days a week) and finished books. Copy never blames.
 */
export default async function StudyReportPage() {
  const [report, goal] = await Promise.all([
    safe(serverApiGet<StudyReport>("/study/report/")),
    safe(serverApiGet<GoalState>("/study/goal/")),
  ]);
  if (!report || !goal) {
    return (
      <p className="rounded-card bg-surface p-4 text-ink-muted shadow-card">کارنامه فعلاً در دسترس نیست. کمی بعد دوباره سر بزنید.</p>
    );
  }
  const today = report.days.find((d) => d.is_today);
  const maxMinutes = Math.max(report.daily_goal_minutes, ...report.days.map((d) => d.minutes));
  const weekPct = goalPercent(report.total_minutes, report.weekly_goal_minutes);
  const subjectMax = Math.max(1, ...report.subjects.map((s) => Math.max(s.minutes, s.target_minutes ?? 0)));
  const range = `${formatJalaliDate(report.week_start, "d MMMM")} تا ${formatJalaliDate(report.week_end, "d MMMM")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-black text-ink">کارنامه مطالعه</h1>
        <p className="text-sm text-ink-muted">این هفته: {range}</p>
      </div>

      {report.streak.milestone && <CelebrationBadge milestone={report.streak.milestone} />}

      {/* today + streak */}
      <section aria-labelledby="today-title" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <h2 id="today-title" className="sr-only">
          امروز
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <GoalRing minutes={goal.minutes} goal={goal.goal_minutes} size={84} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-extrabold text-ink">{goalLine(goal.minutes, goal.goal_minutes, goal.goal_met)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StreakChip days={report.streak.current} met={report.streak.today_met} />
              <span className="text-xs text-ink-muted">
                {toPersianDigits(report.streak.rest_days_left)} روز استراحت باقی‌مانده این هفته
              </span>
            </div>
            <p className="text-sm leading-7 text-ink-muted">{streakLine(report.streak)}</p>
          </div>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <GoalEditor goal={goal.daily_goal_minutes} choices={goal.goal_choices} reviewSms={goal.review_sms} />
        </div>
      </section>

      {/* week chart */}
      <section aria-labelledby="week-title" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="week-title" className="text-lg font-extrabold text-ink">
            دقیقه‌های این هفته
          </h2>
          <p className="text-sm text-ink-muted">
            {minutesText(report.total_minutes)} از هدف {minutesText(report.weekly_goal_minutes)}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="پیشرفت هدف هفته"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={weekPct}
          className="mt-3 h-2 overflow-hidden rounded-full bg-primary-tint"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${weekPct}%` }} />
        </div>
        <p className="mt-2 text-xs leading-6 text-ink-muted">
          هدف هفته = هدف روزانه × ۵ روز؛ دو روز استراحت در هفته بخشی از برنامه است، نه عقب‌ماندگی.
        </p>
        <ol className="mt-4 grid grid-cols-7 items-end gap-1.5 sm:gap-3" aria-label="دقیقه مطالعه هر روز">
          {report.days.map((d, i) => {
            const h = maxMinutes > 0 ? Math.round((d.minutes / maxMinutes) * 100) : 0;
            const goalLineAt = maxMinutes > 0 ? Math.round((d.goal_minutes / maxMinutes) * 100) : 0;
            return (
              <li key={d.date} className="flex flex-col items-center gap-1">
                <span className="text-[0.7rem] font-bold tabular-nums text-ink">{toPersianDigits(d.minutes)}</span>
                <span className="relative flex h-28 w-full max-w-10 items-end overflow-hidden rounded-control bg-neutral-soft">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-dashed border-line-strong"
                    style={{ bottom: `${goalLineAt}%` }}
                  />
                  <span
                    aria-hidden="true"
                    className={`w-full rounded-control ${d.met ? "bg-success" : d.is_future ? "bg-transparent" : "bg-accent"}`}
                    style={{ height: `${h}%` }}
                  />
                </span>
                <span aria-hidden="true" className={`text-xs ${d.is_today ? "font-extrabold text-primary" : "text-ink-muted"}`}>
                  {WEEKDAY_SHORT[i]}
                </span>
                <span className="sr-only">
                  {`${d.weekday}: ${toPersianDigits(d.minutes)} دقیقه${d.met ? "، هدف انجام شد" : ""}`}
                </span>
                {d.met && <CheckIcon size={14} className="text-success" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        {today && !today.met && (
          <p className="mt-3 text-sm text-ink">{goalLine(today.minutes, today.goal_minutes, today.met)}</p>
        )}
      </section>

      {/* per subject */}
      <section aria-labelledby="subjects-title" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <h2 id="subjects-title" className="text-lg font-extrabold text-ink">
          به تفکیک درس
        </h2>
        {report.subjects.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            این هفته هنوز در کتابخوان مطالعه‌ای ثبت نشده است. هر دقیقه‌ای که کتاب الکترونیک را می‌خوانید، همین‌جا به درس
            خودش اضافه می‌شود.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {report.subjects.map((s) => {
              const pct = Math.round((s.minutes / subjectMax) * 100);
              const target = s.target_minutes != null ? Math.round((s.target_minutes / subjectMax) * 100) : null;
              return (
                <li key={s.slug}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-bold text-ink">
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: s.color ?? "var(--color-primary)" }} />
                      {s.name}
                    </span>
                    <span className="text-ink-muted">
                      {minutesText(s.minutes)}
                      {s.target_minutes != null && ` از ${minutesText(s.target_minutes)} طبق برنامه`}
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-neutral-soft" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color ?? "var(--color-primary)" }} />
                    {target != null && (
                      <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ insetInlineStart: `${Math.min(99, target)}%` }} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-ink-muted">
          <ClockIcon size={16} className="mt-1 shrink-0" />
          {report.pace.measured
            ? `سرعت مطالعه شما: هر صفحه حدود ${toPersianDigits(Math.max(1, Math.round(report.pace.minutes_per_page)))} دقیقه.`
            : "سرعت مطالعه شما پس از چند جلسه مطالعه در کتابخوان محاسبه می‌شود."}{" "}
          <Link href={studyRoutes.plan} className="font-bold text-primary underline underline-offset-4">
            برنامه مطالعه من
          </Link>
        </p>
      </section>

      {/* totals + finished books */}
      <section aria-labelledby="books-title" className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-1">
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-muted">روزهای هدف این هفته</dt>
            <dd className="mt-0.5 text-xl font-black text-ink">{toPersianDigits(report.goal_days_met)} روز</dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-muted">کل مطالعه در دادرُز</dt>
            <dd className="mt-0.5 text-xl font-black text-ink">{minutesText(report.all_time_minutes)}</dd>
          </div>
        </dl>
        <div className="rounded-card bg-surface p-4 shadow-card">
          <h2 id="books-title" className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <BookOpenIcon size={20} className="text-primary" />
            کتاب‌های تمام‌شده
          </h2>
          {report.books_finished.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-ink-muted">اولین کتابی که تا صفحه آخر بخوانید اینجا ثبت می‌شود.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {report.books_finished.map((b) => (
                <li key={b.slug} className="flex min-h-11 items-center justify-between gap-2 py-2 text-sm">
                  <Link href={routes.product(b.slug)} className="font-bold text-ink hover:text-primary hover:underline">
                    {b.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
                    <CalendarIcon size={14} />
                    {formatJalaliDate(b.finished_at, "d MMMM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
