import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getStudyPlan } from "@/lib/api";
import { daysLeft } from "@/lib/exam-time";
import { formatJalaliDate, formatNumber, toPersianDigits } from "@/lib/format";
import { groupByWeek } from "@/lib/study-plan";
import { NOINDEX } from "@/lib/seo";
import type { StudyPlanDay } from "@/lib/types";
import { CourseCard } from "@/components/course/CourseCard";
import { PrintButton } from "@/components/plan/PrintButton";
import { LinkPlanButton } from "@/components/study/LinkPlanButton"; // retention stream (ه۵)
import { CalendarIcon, ClockIcon } from "@/components/ui/Icons";

type Params = Promise<{ token: string }>;

// Personal page: rendered per request, never indexed.
export const dynamic = "force-dynamic";

const loadPlan = cache(async (raw: string) => getStudyPlan(decodeSlug(raw)));

export const metadata: Metadata = {
  title: "برنامه مطالعه شخصی",
  robots: NOINDEX,
};

function weekRange(days: StudyPlanDay[]): string {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first || !last) return "";
  if (first === last) return formatJalaliDate(first, "d MMMM");
  const sameMonth = formatJalaliDate(first, "MMMM") === formatJalaliDate(last, "MMMM");
  return sameMonth
    ? `${formatJalaliDate(first, "d")} تا ${formatJalaliDate(last, "d MMMM")}`
    : `${formatJalaliDate(first, "d MMMM")} تا ${formatJalaliDate(last, "d MMMM")}`;
}

export default async function StudyPlanPage({ params }: { params: Params }) {
  const { token } = await params;
  const plan = await loadPlan(token);
  if (!plan) notFound();

  const now = Date.now();
  const examDays = plan.exam ? (daysLeft(plan.exam.date, now) ?? plan.exam.days_left) : null;
  const weeks = groupByWeek(plan.days);
  const stats: [string, string][] = [
    ["صفحه برای مطالعه", formatNumber(plan.summary.total_pages)],
    ["روز مطالعه", toPersianDigits(plan.summary.study_days)],
    ["روز جمع‌بندی", toPersianDigits(plan.summary.review_days)],
    ["صفحه در روز", `≈ ${formatNumber(plan.summary.pages_per_day)}`],
    ["ساعت در روز", toPersianDigits(plan.hours_per_day)],
  ];

  return (
    <div className="plan-print mx-auto max-w-4xl px-4 pb-12 pt-4 md:pt-8">
      <header className="plan-hero relative overflow-hidden rounded-card bg-primary p-5 text-white shadow-card md:p-8">
        <span aria-hidden="true" className="absolute -end-14 -top-14 size-48 rounded-full border-[22px] border-white/[0.06] print:hidden" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-accent">کتاب دادرُز · برنامه مطالعه شخصی</p>
            <h1 className="mt-2 text-2xl font-black leading-10 md:text-3xl md:leading-[3rem]">
              {plan.exam ? `برنامه شما تا ${plan.exam.name}` : "برنامه مطالعه شما"}
            </h1>
            <p className="mt-1 text-sm text-white/85">
              برای <bdi dir="ltr">{toPersianDigits(plan.phone_masked)}</bdi> · {toPersianDigits(plan.hours_per_day)} ساعت مطالعه در روز
            </p>
          </div>
          {plan.exam && examDays != null && examDays > 0 && (
            <div className="shrink-0 rounded-card bg-white/10 px-5 py-3 text-center">
              <p className="text-4xl font-black leading-tight text-accent">{toPersianDigits(examDays)}</p>
              <p className="text-sm font-bold">روز تا آزمون</p>
              <p className="mt-0.5 text-xs text-white/85">{formatJalaliDate(plan.exam.date, "EEEE d MMMM yyyy")}</p>
            </div>
          )}
        </div>
        <div className="relative mt-5 flex flex-wrap items-start gap-3">
          <PrintButton className="bg-white text-primary hover:bg-primary-soft" />
          {/* --- retention stream (ه۵): link this plan to the account for daily check-off --- */}
          <LinkPlanButton token={plan.token} className="print:hidden" />
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-5">
        {stats.map(([k, v], i) => (
          <div key={k} className={`bg-surface px-4 py-3 ${i === stats.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="mt-0.5 text-xl font-black text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 space-y-6">
        {weeks.map((week) => (
          <section key={week.start} aria-labelledby={`week-${week.index}`} className="plan-week">
            <h2 id={`week-${week.index}`} className="flex flex-wrap items-baseline gap-x-3 text-lg font-extrabold text-ink">
              <span>هفته {toPersianDigits(week.index)}</span>
              <span className="text-sm font-medium text-ink-muted">{weekRange(week.days)}</span>
            </h2>
            <ol className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {week.days.map((day) => (
                <li key={day.date} className="plan-day grid gap-2 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
                  <p className="text-sm font-bold text-ink">
                    <time dateTime={day.date}>
                      {formatJalaliDate(day.date, "EEEE")}{" "}
                      <span className="font-medium text-ink-muted">{formatJalaliDate(day.date, "d MMMM")}</span>
                    </time>
                  </p>
                  <ul className="space-y-1.5">
                    {day.items.map((item, i) => (
                      <li key={`${item.book_slug}-${i}`} className="flex items-start gap-2 text-sm leading-6 text-ink">
                        <span
                          aria-hidden="true"
                          className="plan-dot mt-2 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.subject.color, "--dot": item.subject.color } as React.CSSProperties}
                        />
                        <span className="min-w-0">
                          <span className="font-bold">{item.task}</span> «{item.book_title}» · صفحه{" "}
                          {toPersianDigits(item.pages_from)} تا {toPersianDigits(item.pages_to)}
                          <span className="block text-xs text-ink-muted">{item.subject.name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        ))}

        {plan.review.length > 0 && (
          <section aria-labelledby="review-title" className="plan-week">
            <h2 id="review-title" className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <CalendarIcon size={20} className="shrink-0 text-primary" />
              روزهای جمع‌بندی
            </h2>
            <ol className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-accent bg-accent-soft">
              {plan.review.map((r) => (
                <li key={r.date} className="grid gap-1 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
                  <p className="text-sm font-bold text-ink">
                    <time dateTime={r.date}>
                      {formatJalaliDate(r.date, "EEEE")}{" "}
                      <span className="font-medium text-accent-ink">{formatJalaliDate(r.date, "d MMMM")}</span>
                    </time>
                  </p>
                  <p className="text-sm leading-6 text-ink">{r.task}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {plan.recommended_courses.length > 0 && (
        <section aria-labelledby="plan-courses" className="mt-10 print:hidden">
          <h2 id="plan-courses" className="text-lg font-extrabold text-ink">
            دوره‌های پیشنهادی برای همین بازه
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            با {examDays != null && examDays > 0 ? `${toPersianDigits(examDays)} روز` : "زمان"} مانده، این دوره‌های آکادمی دادرُز بیشترین کمک را می‌کنند.
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {plan.recommended_courses.map((c, i) => (
              <li key={c.id}>
                <CourseCard course={c} utmContent="study-plan" book={null} tier={i === 0 ? "plan_first" : "plan"} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 flex items-start gap-2 text-xs leading-6 text-ink-muted">
        <ClockIcon size={16} className="mt-1 shrink-0" />
        این برنامه بر اساس تعداد صفحات کتاب‌ها و ساعت مطالعه شما ساخته شده و پیشنهادی است؛ اگر روزی عقب
        افتادید، از روزهای جمع‌بندی کم نکنید و بار را روی روزهای بعد پخش کنید.
      </p>
    </div>
  );
}
