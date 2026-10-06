"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/session";
import { trackStudyPlanCompressed, trackStudyPlanItemChecked } from "@/lib/analytics";
import { formatJalaliDate, formatPercent, toPersianDigits } from "@/lib/format";
import { weekStart } from "@/lib/study-plan";
import { behindLine, planItemKey, type LivingPlan, type LivingPlanDay, type LivingPlanItem } from "@/lib/study";
import { CalendarIcon, PrinterIcon } from "@/components/ui/Icons";
import { PlanItems } from "./PlanItems";

function groupWeeks(days: LivingPlanDay[]): { start: string; days: LivingPlanDay[] }[] {
  const weeks: { start: string; days: LivingPlanDay[] }[] = [];
  for (const day of days) {
    const start = weekStart(day.date);
    const last = weeks[weeks.length - 1];
    if (last && last.start === start) last.days.push(day);
    else weeks.push({ start, days: [day] });
  }
  return weeks;
}

/** Shared state + actions of the living plan (check-off, compress). */
export function usePlanActions(initial: LivingPlan, view: "today" | "full") {
  const [plan, setPlan] = useState(initial);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function toggle(item: LivingPlanItem, done: boolean) {
    setBusyKey(planItemKey(item));
    setMessage("");
    const res = await apiFetch<LivingPlan>(`/study/plan/check/${view === "today" ? "?view=today" : ""}`, {
      method: "POST",
      json: { book_slug: item.book_slug, pages_from: item.pages_from, pages_to: item.pages_to, done },
    });
    setBusyKey(null);
    if (!res.ok) return setMessage(errorMessage(res.error, undefined, "ثبت نشد. دوباره تلاش کنید."));
    setPlan((p) => ({ ...p, ...res.data }));
    trackStudyPlanItemChecked({ done, where: view === "today" ? "today" : "plan" });
    setMessage(done ? "ثبت شد؛ آفرین." : "علامت برداشته شد.");
  }

  async function compress() {
    setBusyKey("compress");
    setMessage("");
    const behind = plan.status.behind_days;
    const res = await apiFetch<LivingPlan>("/study/plan/compress/", { method: "POST" });
    setBusyKey(null);
    if (!res.ok) return setMessage(errorMessage(res.error, undefined, "فشرده‌سازی انجام نشد. دوباره تلاش کنید."));
    setPlan((p) => ({ ...p, ...res.data }));
    trackStudyPlanCompressed({ behind_days: behind });
    setMessage("برنامه از امروز تا روز آزمون دوباره چیده شد.");
  }

  return { plan, busyKey, message, toggle, compress };
}

export function BehindBanner({
  plan,
  busy,
  onCompress,
}: {
  plan: LivingPlan;
  busy: boolean;
  onCompress: () => void;
}) {
  if (!plan.status.behind_days) return null;
  return (
    <div className="rounded-card border border-warning bg-warning-soft p-4">
      <p className="font-bold leading-7 text-warning">{behindLine(plan.status.behind_days)}</p>
      <p className="mt-1 text-sm leading-6 text-ink">
        {toPersianDigits(plan.status.pages_behind)} صفحه خوانده‌نشده روی روزهای باقی‌مانده پخش می‌شود و روزهای جمع‌بندی سر جایشان
        می‌مانند.
      </p>
      {plan.status.can_compress && (
        <button
          type="button"
          onClick={onCompress}
          disabled={busy}
          className="mt-3 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "در حال چیدن دوباره…" : "فشرده‌سازی برنامه"}
        </button>
      )}
    </div>
  );
}

/** «امروز»: today's items (or review task, or what is next). */
export function TodaySection({
  plan,
  busyKey,
  onToggle,
  readable,
  headingLevel = 2,
}: {
  plan: LivingPlan;
  busyKey: string | null;
  onToggle: (item: LivingPlanItem, done: boolean) => void;
  readable: Set<string>;
  headingLevel?: 2 | 3;
}) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const { day, review, next_day } = plan.today;
  const doneCount = day?.items.filter((i) => i.done).length ?? 0;
  return (
    <section aria-labelledby="plan-today" className="rounded-card bg-surface p-4 shadow-card md:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <H id="plan-today" className="text-lg font-extrabold text-ink">
          امروز · {formatJalaliDate(plan.today.date, "EEEE d MMMM")}
        </H>
        {day && (
          <span className="text-sm text-ink-muted">
            {toPersianDigits(doneCount)} از {toPersianDigits(day.items.length)} انجام شد
          </span>
        )}
      </div>
      {day ? (
        <PlanItems items={day.items} busyKey={busyKey} onToggle={onToggle} readable={readable} />
      ) : review ? (
        <p className="rounded-control bg-accent-soft px-3 py-3 text-sm font-bold text-ink">{review.task}</p>
      ) : next_day ? (
        <div>
          <p className="mb-2 text-sm text-ink-muted">
            امروز در برنامه کاری نیست. بعدی: {formatJalaliDate(next_day.date, "EEEE d MMMM")}
          </p>
          <PlanItems items={next_day.items} busyKey={busyKey} onToggle={onToggle} readable={readable} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">برای امروز کاری در برنامه نیست.</p>
      )}
    </section>
  );
}

/** The whole account-linked plan: status, today, books and every week (check-off everywhere). */
export function LivingPlanView({ initial, readable }: { initial: LivingPlan; readable: string[] }) {
  const { plan, busyKey, message, toggle, compress } = usePlanActions(initial, "full");
  const canRead = new Set(readable);
  const weeks = groupWeeks(plan.days ?? []);
  const today = plan.today.date;

  return (
    <div className="space-y-5">
      <header className="rounded-card bg-primary p-5 text-white shadow-card">
        <p className="text-xs font-bold text-accent">برنامه مطالعه زنده</p>
        <h1 className="mt-1 text-xl font-black leading-9 md:text-2xl">
          {plan.exam ? `برنامه من تا ${plan.exam.name}` : "برنامه مطالعه من"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {plan.exam && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon size={16} />
              {toPersianDigits(plan.exam.days_left)} روز تا آزمون
            </span>
          )}
          <span>
            {toPersianDigits(plan.status.pages_done)} از {toPersianDigits(plan.status.total_pages)} صفحه ·{" "}
            {formatPercent(plan.status.percent)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="پیشرفت برنامه"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(plan.status.percent)}
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${plan.status.percent}%` }} />
        </div>
        {plan.lead_token && (
          <Link
            href={`/plan/${plan.lead_token}`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control bg-white px-4 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            <PrinterIcon size={18} />
            نسخه چاپی برنامه اولیه
          </Link>
        )}
      </header>

      <p role="status" aria-live="polite" className="text-sm font-bold text-success empty:hidden">
        {message}
      </p>

      <BehindBanner plan={plan} busy={busyKey === "compress"} onCompress={() => void compress()} />

      <TodaySection plan={plan} busyKey={busyKey} onToggle={(i, d) => void toggle(i, d)} readable={canRead} />

      <section aria-labelledby="plan-books" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <h2 id="plan-books" className="text-lg font-extrabold text-ink">
          کتاب‌های برنامه
        </h2>
        <ul className="mt-3 space-y-3">
          {plan.books.map((b) => {
            const pct = b.total_pages ? Math.round((b.pages_done / b.total_pages) * 100) : 0;
            return (
              <li key={b.slug}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-bold text-ink">{b.title}</span>
                  <span className="shrink-0 text-ink-muted">
                    {toPersianDigits(b.pages_done)} / {toPersianDigits(b.total_pages)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-soft" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: b.subject?.color ?? "var(--color-primary)" }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-6 text-ink-muted">
          پیشرفت کتاب‌های الکترونیک از کتابخوان خودکار به‌روز می‌شود؛ برای نسخه چاپی، کارهای هر روز را تیک بزنید.
        </p>
      </section>

      <div className="space-y-5">
        {weeks.map((week, wi) => (
          <section key={week.start} aria-labelledby={`pw-${wi}`}>
            <h2 id={`pw-${wi}`} className="mb-2 text-base font-extrabold text-ink">
              هفته {toPersianDigits(wi + 1)}
              <span className="ms-2 text-sm font-medium text-ink-muted">از {formatJalaliDate(week.start, "d MMMM")}</span>
            </h2>
            <ol className="space-y-3">
              {week.days.map((day) => (
                <li
                  key={day.date}
                  className={`rounded-card bg-surface p-3 shadow-card ${day.date === today ? "ring-2 ring-accent" : ""}`}
                >
                  <p className="mb-2 flex items-center justify-between gap-2 text-sm font-bold text-ink">
                    <time dateTime={day.date}>{formatJalaliDate(day.date, "EEEE d MMMM")}</time>
                    {day.done && <span className="text-xs text-success">انجام شد</span>}
                  </p>
                  <PlanItems items={day.items} busyKey={busyKey} onToggle={(i, d) => void toggle(i, d)} readable={canRead} />
                </li>
              ))}
            </ol>
          </section>
        ))}
        {(plan.review ?? []).length > 0 && (
          <section aria-labelledby="pw-review">
            <h2 id="pw-review" className="mb-2 text-base font-extrabold text-ink">
              روزهای جمع‌بندی
            </h2>
            <ol className="divide-y divide-line overflow-hidden rounded-card border border-accent bg-accent-soft">
              {(plan.review ?? []).map((r) => (
                <li key={r.date} className="flex flex-wrap gap-x-4 px-4 py-3 text-sm">
                  <time dateTime={r.date} className="font-bold text-ink">
                    {formatJalaliDate(r.date, "EEEE d MMMM")}
                  </time>
                  <span className="text-ink">{r.task}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
