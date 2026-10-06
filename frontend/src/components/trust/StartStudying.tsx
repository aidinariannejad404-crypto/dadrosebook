"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { Order } from "@/lib/account-types";
import { trackStartStudying } from "@/lib/analytics";
import { formatToman, toPersianDigits } from "@/lib/format";
import { resetOwnedCache } from "@/lib/owned";
import { apiFetch, errorMessage } from "@/lib/session";
import { booksLabel, examLine, readFirstAction, shippingLine } from "@/lib/start-studying";
import type { ReminderConsent, StartStudying as StartData } from "@/lib/trust-types";
import { MiniCover } from "@/components/account/MiniCover";
import { BookOpenIcon, CalendarIcon, TruckIcon } from "@/components/ui/Icons";

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover aria-disabled:opacity-70";
const accentBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 font-extrabold text-ink transition-[filter] hover:brightness-95 aria-disabled:opacity-70";

/**
 * د۳ «شروع مطالعه» under a successful payment: order summary, delivery promise, «اول این را
 * بخوان» (deep link to the reader), one-tap study plan from the purchased books and the opt-in to
 * SMS study reminders.
 */
export function StartStudying({ order }: { order: Order }) {
  const uid = useId();
  const router = useRouter();
  const [data, setData] = useState<StartData | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderConsent | null>(null);
  const [reminderNote, setReminderNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    resetOwnedCache(); // the books just bought are owned now
    let alive = true;
    void apiFetch<StartData>(`/me/orders/${encodeURIComponent(order.number)}/start/`).then((r) => {
      if (!alive || !r.ok) return;
      setData(r.data);
      setReminders(r.data.reminders);
    });
    return () => {
      alive = false;
    };
  }, [order.number]);

  async function makePlan() {
    if (planBusy) return;
    setPlanBusy(true);
    setPlanError(null);
    const res = await apiFetch<{ token: string; plan_url: string }>("/me/study-plan/", {
      method: "POST",
      json: { order: order.number, exam_type: data?.plan.exam_type ?? "" },
    });
    if (res.ok) {
      trackStartStudying("study_plan", order.number);
      router.push(res.data.plan_url.startsWith("/plan/") ? res.data.plan_url : `/plan/${encodeURIComponent(res.data.token)}`);
      return;
    }
    setPlanBusy(false);
    setPlanError(errorMessage(res.error, undefined, "ساختن برنامه انجام نشد. چند لحظه بعد دوباره تلاش کنید."));
  }

  async function toggleReminders(on: boolean) {
    const previous = reminders;
    setReminders({ sms: on, consented_at: previous?.consented_at ?? null });
    setReminderNote(null);
    const res = await apiFetch<ReminderConsent>("/me/study-reminders/", {
      method: "PUT",
      json: { sms: on, source: "payment_result" },
    });
    if (res.ok) {
      setReminders(res.data);
      trackStartStudying(on ? "reminders_on" : "reminders_off", order.number);
      setReminderNote({ ok: true, text: on ? "یادآور مطالعه فعال شد." : "یادآور مطالعه خاموش شد." });
    } else {
      setReminders(previous);
      setReminderNote({ ok: false, text: errorMessage(res.error, undefined, "ذخیره نشد. دوباره تلاش کنید.") });
    }
  }

  const ship = shippingLine(order);
  const readFirst = data?.read_first ?? null;
  const exam = examLine(data);

  return (
    <div className="mt-6 space-y-4 text-start">
      <section aria-labelledby={`${uid}-summary`} className="rounded-control border border-line p-3">
        <h2 id={`${uid}-summary`} className="text-sm font-extrabold text-ink">
          خلاصه سفارش
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item, i) => (
            <li key={`${item.book_slug}-${item.variant_type}-${i}`} className="flex items-center gap-3 py-2">
              <MiniCover title={item.title} cover={item.cover} color={item.subject_color} className="w-9" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2 font-bold leading-6 text-ink">{item.title}</p>
                <p className="text-xs text-ink-muted">
                  {item.variant_type_label}
                  {item.quantity > 1 && ` × ${toPersianDigits(item.quantity)}`}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-ink">{formatToman(item.line_total)}</span>
            </li>
          ))}
        </ul>
        {ship && (
          <p className="mt-2 flex items-start gap-2 rounded-control bg-bg px-3 py-2 text-sm font-bold leading-7 text-ink">
            <TruckIcon size={18} className="mt-1 shrink-0 text-primary" />
            {ship}
          </p>
        )}
      </section>

      {readFirst && (
        <section aria-labelledby={`${uid}-first`} className="rounded-control bg-success-soft p-3">
          <h2 id={`${uid}-first`} className="flex items-center gap-1.5 text-sm font-extrabold text-success">
            <BookOpenIcon size={18} className="shrink-0" />
            اول این را بخوانید
          </h2>
          <div className="mt-2 flex items-center gap-3">
            <MiniCover title={readFirst.title} cover={readFirst.cover} color={readFirst.subject_color} className="w-12" />
            <p className="min-w-0 flex-1 font-bold leading-7 text-ink">{readFirst.title}</p>
          </div>
          <Link
            href={readFirst.reader_url}
            prefetch={false}
            onClick={() => trackStartStudying("read_first", order.number)}
            className={`${primaryBtn} mt-3 w-full`}
          >
            {readFirstAction(readFirst)}
          </Link>
        </section>
      )}

      {data && data.plan.books.length > 0 && (
        <section aria-labelledby={`${uid}-plan`} className="rounded-control bg-primary p-4 text-white">
          <h2 id={`${uid}-plan`} className="flex items-center gap-1.5 font-extrabold">
            <CalendarIcon size={18} className="shrink-0 text-accent" />
            برنامه مطالعه با همین کتاب‌ها
          </h2>
          <p className="mt-1 text-sm leading-7 text-white/90">
            روزبه‌روز تا آزمون، با {booksLabel(data.plan.books)}.
            {exam && <span className="block font-bold text-accent">{exam}</span>}
          </p>
          <button type="button" onClick={() => void makePlan()} aria-disabled={planBusy || undefined} className={`${accentBtn} mt-3 w-full`}>
            {planBusy ? "در حال ساختن برنامه…" : "برنامه مطالعه من را بساز"}
          </button>
          <div aria-live="polite">
            {planError && (
              <p role="alert" className="mt-2 rounded-control bg-surface px-3 py-2 text-sm font-bold text-danger">
                {planError}
              </p>
            )}
          </div>
        </section>
      )}

      {reminders && (
        <div className="rounded-control border border-line p-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-7 text-ink">
            <input
              type="checkbox"
              checked={reminders.sms}
              onChange={(e) => void toggleReminders(e.target.checked)}
              aria-describedby={`${uid}-rem-hint`}
              className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block font-bold">یادآور پیامکی مطالعه را برایم بفرست</span>
              <span id={`${uid}-rem-hint`} className="block text-xs text-ink-muted">
                هر وقت بخواهید از «آمادگی من» در حساب کاربری خاموشش کنید.
              </span>
            </span>
          </label>
          <p role="status" className={`text-xs font-bold empty:hidden ${reminderNote?.ok ? "text-success" : "text-danger"}`}>
            {reminderNote?.text}
          </p>
        </div>
      )}
    </div>
  );
}
