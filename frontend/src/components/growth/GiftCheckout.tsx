"use client";

import { useId } from "react";
import type { ShippingOption } from "@/lib/account-types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { GIFT_MESSAGE_MAX, type GiftRequest } from "@/lib/growth";
import { TruckIcon } from "@/components/ui/Icons";

const input =
  "mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted";

/**
 * و۴: «این خرید هدیه است» at checkout. A gift skips the buyer's address: after payment the buyer gets
 * a one-time link (+ printable card); the recipient claims it with phone OTP and enters the address.
 */
export function GiftToggle({
  on,
  onChange,
  value,
  onValue,
  needsShipping,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  value: GiftRequest;
  onValue: (v: GiftRequest) => void;
  needsShipping: boolean;
}) {
  const id = useId();
  const set = (k: keyof GiftRequest) => (e: { target: { value: string } }) => onValue({ ...value, [k]: e.target.value });
  return (
    <div className={`rounded-control border p-3 ${on ? "border-accent bg-accent-soft" : "border-line"}`}>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--color-primary)]"
        />
        <span>
          <span className="block font-extrabold text-ink">این خرید هدیه است</span>
          <span className="block text-xs leading-6 text-ink-muted">
            بعد از پرداخت یک لینک یک‌بارمصرف و کارت قابل چاپ می‌گیرید؛ گیرنده با شماره موبایلش هدیه را دریافت
            {needsShipping ? " و نشانی ارسال را خودش وارد می‌کند." : " می‌کند و کتاب به کتابخانه او اضافه می‌شود."}
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-from`} className="text-sm font-bold text-ink">
              نام شما (فرستنده)
            </label>
            <input id={`${id}-from`} maxLength={80} value={value.sender_name} onChange={set("sender_name")} className={input} />
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="text-sm font-bold text-ink">
              نام گیرنده <span className="font-medium text-ink-muted">(اختیاری)</span>
            </label>
            <input id={`${id}-to`} maxLength={80} value={value.recipient_name} onChange={set("recipient_name")} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-msg`} className="text-sm font-bold text-ink">
              پیام روی کارت <span className="font-medium text-ink-muted">(اختیاری)</span>
            </label>
            <textarea
              id={`${id}-msg`}
              rows={2}
              maxLength={GIFT_MESSAGE_MAX}
              value={value.message}
              onChange={set("message")}
              className="mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base leading-7 text-ink"
            />
            <p className="mt-1 text-xs text-ink-muted">
              {toPersianDigits(value.message.length)} از {toPersianDigits(GIFT_MESSAGE_MAX)} نویسه
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const card =
  "flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-control border-2 border-line bg-surface p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-line-strong";

/** Shipping methods for a gift (no address yet, so Tehran-only couriers are not offered). */
export function GiftShippingMethods({
  options,
  error,
  selectedId,
  onSelect,
}: {
  options: ShippingOption[] | null;
  error: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const uid = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-base font-extrabold text-ink">روش ارسال هدیه</legend>
      <p className="mb-2 text-sm leading-7 text-ink-muted">نشانی را گیرنده هنگام دریافت هدیه وارد می‌کند.</p>
      {error && (
        <p role="alert" className="mb-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {error}
        </p>
      )}
      {options == null && !error && <p className="text-sm text-ink-muted">در حال دریافت روش‌های ارسال…</p>}
      <div className="grid gap-2">
        {options?.map((m) => (
          <label key={m.id} className="relative block">
            <input
              type="radio"
              name={`${uid}-method`}
              checked={selectedId === m.id}
              onChange={() => onSelect(m.id)}
              className="peer sr-only"
            />
            <span className={card}>
              <TruckIcon size={22} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm leading-7">
                <span className="block font-extrabold text-ink">{m.name}</span>
                {m.eta_note && <span className="block text-ink-muted">{m.eta_note}</span>}
              </span>
              <span className="shrink-0 text-sm font-extrabold">
                {m.price === 0 ? <span className="text-success">رایگان</span> : <span className="text-ink">{formatToman(m.price)}</span>}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
