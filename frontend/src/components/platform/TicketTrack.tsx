"use client";

import { useId, useState, type FormEvent } from "react";
import type { TicketDetail } from "@/lib/platform-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { PHONE_INVALID, isValidPhone, normalizePhone } from "@/lib/otp";
import { cleanTrackingCode, isTrackingCode } from "@/lib/support";
import { toPersianDigits } from "@/lib/format";
import { TicketThread } from "./TicketThread";

const field = "mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-end text-base text-ink aria-[invalid=true]:border-danger";

/** PF-11: guests check a ticket with phone + tracking code (like help.fidibo.com, but by phone). */
export function TicketTrack({ initialCode }: { initialCode: string }) {
  const id = useId();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(cleanTrackingCode(initialCode));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!isValidPhone(p)) return setError(PHONE_INVALID);
    if (!isTrackingCode(code)) return setError("کد پیگیری ۸ رقمی را کامل وارد کنید.");
    setBusy(true);
    setError("");
    const res = await apiFetch<TicketDetail>("/support/lookup/", { method: "POST", json: { phone: p, tracking_code: code } });
    setBusy(false);
    if (res.ok) setTicket(res.data);
    else setError(errorMessage(res.error));
  }

  if (ticket) return <TicketThread initial={ticket} guestPhone={normalizePhone(phone)} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-card bg-surface p-4 shadow-card md:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-phone`} className="text-sm font-bold text-ink">
            شماره موبایل ثبت‌شده
          </label>
          <input id={`${id}-phone`} type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor={`${id}-code`} className="text-sm font-bold text-ink">
            کد پیگیری
          </label>
          <input
            id={`${id}-code`}
            inputMode="numeric"
            dir="ltr"
            value={toPersianDigits(code)}
            onChange={(e) => setCode(cleanTrackingCode(e.target.value))}
            className={`${field} tracking-widest`}
          />
        </div>
      </div>
      <p role="alert" className="text-sm font-bold text-danger empty:hidden">
        {error}
      </p>
      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-6 font-extrabold text-white hover:bg-primary-hover disabled:opacity-60 sm:w-auto">
        {busy ? "در حال جست‌وجو…" : "پیگیری درخواست"}
      </button>
    </form>
  );
}
