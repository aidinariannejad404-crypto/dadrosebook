"use client";

import { useState, type FormEvent } from "react";
import type { TicketDetail } from "@/lib/platform-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { formatJalaliDateTime } from "@/lib/order-status";
import { BODY_MIN, ticketTone } from "@/lib/support";
import { toPersianDigits } from "@/lib/format";
import { StatusPill } from "@/components/account/StatusPill";

/** PF-11: a ticket's conversation, status and the customer's reply box. */
export function TicketThread({ initial, guestPhone }: { initial: TicketDetail; guestPhone?: string }) {
  const [ticket, setTicket] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reply(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < BODY_MIN) {
      setError(`پیام را کامل‌تر بنویسید (دست‌کم ${toPersianDigits(BODY_MIN)} نویسه).`);
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiFetch<TicketDetail>(`/support/tickets/${ticket.tracking_code}/messages/`, {
      method: "POST",
      json: { body, ...(guestPhone ? { phone: guestPhone } : {}) },
    });
    setBusy(false);
    if (res.ok) {
      setTicket(res.data);
      setBody("");
    } else setError(errorMessage(res.error, "body"));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-extrabold text-ink">{ticket.subject}</h2>
          <StatusPill tone={ticketTone(ticket.status)}>{ticket.status_label}</StatusPill>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-muted">کد پیگیری</dt>
          <dd>
            <bdi dir="ltr" className="font-bold text-ink">
              {toPersianDigits(ticket.tracking_code)}
            </bdi>
          </dd>
          <dt className="text-ink-muted">موضوع</dt>
          <dd className="text-ink">{ticket.topic_label}</dd>
          {ticket.order_number && (
            <>
              <dt className="text-ink-muted">سفارش</dt>
              <dd>
                <bdi className="text-ink">{ticket.order_number}</bdi>
              </dd>
            </>
          )}
          {ticket.book_title && (
            <>
              <dt className="text-ink-muted">کتاب</dt>
              <dd className="text-ink">{ticket.book_title}</dd>
            </>
          )}
        </dl>
      </div>

      <ol aria-label="گفتگو" className="space-y-3">
        {ticket.messages.map((m) => {
          const staff = m.author === "staff";
          return (
            <li key={m.id} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-card px-4 py-3 shadow-card ${staff ? "bg-primary-soft" : "bg-surface"}`}>
                <p className="text-xs font-bold text-primary">
                  {m.author_label} · <time dateTime={m.created_at}>{formatJalaliDateTime(m.created_at)}</time>
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-7 text-ink">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {ticket.status === "closed" ? (
        <p className="rounded-control bg-bg px-4 py-3 text-sm text-ink-muted">
          این درخواست بسته شده است. اگر مشکل باقی است، درخواست تازه‌ای ثبت کنید.
        </p>
      ) : (
        <form onSubmit={reply} noValidate className="rounded-card bg-surface p-4 shadow-card">
          <label htmlFor="ticket-reply" className="text-sm font-bold text-ink">
            پیام تازه
          </label>
          <textarea
            id="ticket-reply"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="ticket-reply-err"
            className="mt-1.5 block w-full rounded-control border border-line-strong bg-surface p-3 text-base text-ink"
          />
          <p id="ticket-reply-err" role="alert" className="mt-1 text-sm font-bold text-danger empty:hidden">
            {error}
          </p>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "در حال ارسال…" : "ارسال پیام"}
          </button>
        </form>
      )}
    </div>
  );
}
