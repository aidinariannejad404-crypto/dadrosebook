import Link from "next/link";
import { accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { daysLeftText, missingVariantIds, percentValue, readinessPercent, readText, subjectStatus, type Tone } from "@/lib/readiness";
import type { Readiness, ReadinessSubject } from "@/lib/trust-types";
import { MiniCover } from "@/components/account/MiniCover";
import { BookOpenIcon, CheckIcon, ClockIcon } from "@/components/ui/Icons";
import { AddMissingButton, ReadinessAddButton } from "./ReadinessActions";

const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-neutral-soft text-ink",
};

function Bar({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`h-2 overflow-hidden rounded-full bg-line ${className}`}
    >
      <div className="h-full rounded-full bg-success" style={{ width: `${value}%` }} />
    </div>
  );
}

/** «آمادگی منابع: ۵ از ۷ درس» headline card (also used on the account dashboard). */
export function ReadinessHeadline({ data, link = false }: { data: Readiness; link?: boolean }) {
  const days = daysLeftText(data.exam);
  const pct = readinessPercent(data.ready_subjects, data.total_subjects);
  return (
    <section aria-labelledby="readiness-headline" className="rounded-card bg-primary p-4 text-white shadow-card md:p-5">
      <p className="text-sm font-bold text-accent">{data.exam?.name}</p>
      <h2 id="readiness-headline" className="mt-1 text-xl font-black leading-9">
        {data.headline}
      </h2>
      <div
        role="progressbar"
        aria-label="درس‌هایی که منابع ضروری‌شان را دارید"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        {days ? (
          <p className="inline-flex items-center gap-1.5 font-bold">
            <ClockIcon size={16} className="shrink-0 text-accent" />
            {days}
          </p>
        ) : (
          <span />
        )}
        {link && (
          <Link href={accountRoutes.readiness} className="inline-flex min-h-11 items-center font-extrabold text-white underline underline-offset-4">
            جزئیات آمادگی
          </Link>
        )}
      </div>
    </section>
  );
}

function SubjectCard({ s }: { s: ReadinessSubject }) {
  const status = subjectStatus(s);
  const read = readText(s.percent_read);
  return (
    <li className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="h-5 w-1.5 rounded-full" style={{ background: s.subject.color }} />
        <h3 className="text-base font-black text-ink">{s.subject.name}</h3>
        {s.weight != null && <span className="text-xs font-bold text-ink-muted">ضریب {toPersianDigits(s.weight)}</span>}
        <span className={`ms-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[status.tone]}`}>
          {s.ready && <CheckIcon size={13} strokeWidth={2.8} />}
          {status.text}
        </span>
      </div>
      {read && (
        <div className="mt-3">
          <p className="text-xs text-ink-muted">مطالعه نسخه‌های الکترونیک این درس: {read}</p>
          <Bar value={percentValue(s.percent_read)} label={`پیشرفت مطالعه ${s.subject.name}`} className="mt-1.5" />
        </div>
      )}
      <ul className="mt-3 divide-y divide-line">
        {s.books.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <MiniCover title={b.title} cover={b.cover} color={b.subject_color} className="w-10" />
            <div className="min-w-0 flex-1 basis-44 text-sm">
              <Link href={routes.product(b.slug)} className="font-bold leading-6 text-ink hover:text-primary hover:underline">
                {b.title}
              </Link>
              {b.owned ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-success">
                  <CheckIcon size={13} strokeWidth={2.8} className="shrink-0" />
                  دارید ({b.formats.map((f) => (f === "EBOOK" ? "الکترونیک" : "چاپی")).join(" + ")})
                  {readText(b.percent_read) && <span className="font-medium text-ink-muted"> · {readText(b.percent_read)}</span>}
                </p>
              ) : (
                <p className="mt-0.5 text-xs font-bold text-ink-muted">ندارید</p>
              )}
            </div>
            {b.owned && b.formats.includes("EBOOK") ? (
              <Link
                href={accountRoutes.read(b.slug)}
                className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-extrabold text-primary hover:bg-primary-soft"
              >
                <BookOpenIcon size={16} className="shrink-0" />
                {percentValue(b.percent_read) > 0 ? "ادامه مطالعه" : "شروع مطالعه"}
              </Link>
            ) : (
              !b.owned &&
              b.buy_variant && (
                <ReadinessAddButton
                  variantId={b.buy_variant.id}
                  bookId={b.id}
                  title={b.title}
                  typeLabel={b.buy_variant.type_label}
                  price={b.buy_variant.price}
                />
              )
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

/** د۴ per-subject readiness for the customer's exam. */
export function ReadinessDashboard({ data }: { data: Readiness }) {
  if (!data.exam) {
    return (
      <section className="rounded-card bg-surface p-5 text-center shadow-card">
        <h2 className="text-lg font-black text-ink">آزمونتان را انتخاب کنید</h2>
        <p className="mt-2 leading-7 text-ink-muted">
          با انتخاب آزمون، برای هر درس می‌بینید کدام منبع ضروری را دارید، چقدر خوانده‌اید و چند روز مانده است.
        </p>
        <Link
          href={routes.kit}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
        >
          انتخاب آزمون و دیدن کیت
        </Link>
      </section>
    );
  }
  if (data.subjects.length === 0) {
    return (
      <p className="rounded-card bg-surface p-4 text-sm leading-7 text-ink-muted shadow-card">
        برای {data.exam.name} هنوز منابع ضروری ثبت نشده است.
      </p>
    );
  }
  const missing = missingVariantIds(data.subjects);
  return (
    <div className="space-y-4">
      <ReadinessHeadline data={data} />
      {missing.length > 0 && <AddMissingButton variantIds={missing} />}
      <ul className="space-y-3">
        {data.subjects.map((s) => (
          <SubjectCard key={s.subject.id} s={s} />
        ))}
      </ul>
    </div>
  );
}
