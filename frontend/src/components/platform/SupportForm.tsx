"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import type { TicketDetail } from "@/lib/platform-types";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";
import { useNavSummary } from "@/lib/nav-summary";
import { BODY_MIN, SUPPORT_TOPICS, isTopic } from "@/lib/support";
import { PHONE_INVALID, isValidPhone, normalizePhone } from "@/lib/otp";
import { platformRoutes } from "@/lib/platform-routes";
import { toPersianDigits } from "@/lib/format";
import { trackSupportTicket } from "@/lib/analytics";
import { CopyButton } from "@/components/account/CopyButton";
import { CheckIcon } from "@/components/ui/Icons";

const field = "mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink aria-[invalid=true]:border-danger";

/** PF-11: open a support ticket (guests give a phone; the tracking code is shown and SMS'd on reply). */
export function SupportForm({
  defaults,
}: {
  defaults: { topic?: string; order?: string; book?: string; source?: string };
}) {
  const id = useId();
  const nav = useNavSummary();
  const loggedIn = !!nav.data;
  const [topic, setTopic] = useState(isTopic(defaults.topic) ? defaults.topic! : defaults.order ? "order" : "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [order, setOrder] = useState(defaults.order ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TicketDetail | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!topic) local.topic = "موضوع درخواست را انتخاب کنید.";
    if (body.trim().length < BODY_MIN) local.body = `شرح درخواست را کامل‌تر بنویسید (دست‌کم ${toPersianDigits(BODY_MIN)} نویسه).`;
    if (!loggedIn && !isValidPhone(normalizePhone(phone))) local.phone = PHONE_INVALID;
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const res = await apiFetch<TicketDetail>("/support/tickets/", {
      method: "POST",
      json: {
        topic,
        subject,
        body,
        order_number: order,
        book: defaults.book ?? "",
        source: defaults.source ?? "support",
        ...(loggedIn ? {} : { phone: normalizePhone(phone), name }),
      },
    });
    setBusy(false);
    if (!res.ok) {
      const fe = fieldErrors(res.error);
      setErrors(Object.keys(fe).length ? fe : { detail: errorMessage(res.error) });
      return;
    }
    trackSupportTicket({ topic, source: defaults.source ?? "support", logged_in: loggedIn });
    setDone(res.data);
  }

  if (done) {
    return (
      <div role="status" className="rounded-card bg-surface p-5 text-center shadow-card">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CheckIcon size={30} />
        </span>
        <h2 className="mt-3 text-lg font-extrabold text-ink">درخواست شما ثبت شد</h2>
        <p className="mt-2 text-sm text-ink-muted">کد پیگیری را نگه دارید؛ پاسخ پشتیبانی پیامک می‌شود.</p>
        <p className="mt-3 flex items-center justify-center gap-2">
          <bdi dir="ltr" className="rounded-control bg-bg px-3 py-1.5 text-xl font-black tracking-widest text-ink">
            {toPersianDigits(done.tracking_code)}
          </bdi>
          <CopyButton value={done.tracking_code} label="کپی کد پیگیری" />
        </p>
        <Link
          href={loggedIn ? platformRoutes.accountTicket(done.tracking_code) : platformRoutes.track(done.tracking_code)}
          className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white"
        >
          مشاهده وضعیت درخواست
        </Link>
      </div>
    );
  }

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${id}-${k}-err`} role="alert" className="mt-1 text-sm font-bold text-danger">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-card bg-surface p-4 shadow-card md:p-6">
      <fieldset>
        <legend className="text-sm font-bold text-ink">موضوع</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SUPPORT_TOPICS.map((t) => (
            <label
              key={t.value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm ${
                topic === t.value ? "border-primary bg-primary-soft font-bold" : "border-line-strong"
              }`}
            >
              <input type="radio" name="topic" value={t.value} checked={topic === t.value} onChange={() => setTopic(t.value)} className="size-4 accent-[var(--color-primary)]" />
              {t.label}
            </label>
          ))}
        </div>
        {err("topic")}
      </fieldset>

      {(topic === "order" || topic === "return" || topic === "payment" || order) && (
        <div>
          <label htmlFor={`${id}-order`} className="text-sm font-bold text-ink">
            شماره سفارش (اختیاری)
          </label>
          <input id={`${id}-order`} dir="ltr" value={order} onChange={(e) => setOrder(e.target.value)} className={`${field} h-12 text-end`} aria-invalid={errors.order_number ? true : undefined} />
          {err("order_number")}
        </div>
      )}

      <div>
        <label htmlFor={`${id}-subject`} className="text-sm font-bold text-ink">
          عنوان (اختیاری)
        </label>
        <input id={`${id}-subject`} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} className={`${field} h-12`} />
      </div>

      <div>
        <label htmlFor={`${id}-body`} className="text-sm font-bold text-ink">
          شرح درخواست
        </label>
        <textarea
          id={`${id}-body`}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${id}-body-err` : undefined}
          className={`${field} p-3`}
        />
        {err("body")}
      </div>

      {!loggedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-phone`} className="text-sm font-bold text-ink">
              شماره موبایل
            </label>
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? `${id}-phone-err` : undefined}
              className={`${field} h-12 text-end`}
            />
            {err("phone")}
          </div>
          <div>
            <label htmlFor={`${id}-name`} className="text-sm font-bold text-ink">
              نام (اختیاری)
            </label>
            <input id={`${id}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={`${field} h-12`} />
          </div>
        </div>
      )}
      {err("detail")}
      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-6 text-base font-extrabold text-white hover:bg-primary-hover disabled:opacity-60 sm:w-auto">
        {busy ? "در حال ثبت…" : "ثبت درخواست"}
      </button>
    </form>
  );
}
