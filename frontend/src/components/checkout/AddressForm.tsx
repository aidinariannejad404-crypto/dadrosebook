"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { Address, AddressInput } from "@/lib/account-types";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";
import { digitsOnly, isValidPhone, normalizePhone, PHONE_INVALID } from "@/lib/otp";
import { toPersianDigits } from "@/lib/format";

const input =
  "mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted aria-[invalid=true]:border-danger";

type Field = "title" | "recipient_name" | "recipient_phone" | "province" | "city" | "postal_code" | "address_line";
const ORDER: Field[] = ["recipient_name", "recipient_phone", "province", "city", "postal_code", "address_line", "title"];

/** Inline «آدرس جدید» form → POST /addresses/. */
export function AddressForm({
  provinces,
  defaultPhone,
  defaultName,
  onCreated,
  onCancel,
}: {
  provinces: string[];
  defaultPhone: string;
  defaultName: string;
  onCreated: (a: Address) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  function focusFirst(errs: Partial<Record<Field | "form", string>>) {
    const first = ORDER.find((f) => errs[f]);
    formRef.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : "[data-form-error]")?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const d = new FormData(e.currentTarget);
    const get = (k: Field) => String(d.get(k) ?? "").trim();
    const body: AddressInput = {
      title: get("title"),
      recipient_name: get("recipient_name"),
      recipient_phone: normalizePhone(get("recipient_phone")),
      province: get("province"),
      city: get("city"),
      postal_code: digitsOnly(get("postal_code")),
      address_line: get("address_line"),
      is_default: false,
    };
    const errs: Partial<Record<Field, string>> = {};
    if (!body.recipient_name) errs.recipient_name = "نام گیرنده را وارد کنید.";
    if (!isValidPhone(body.recipient_phone)) errs.recipient_phone = PHONE_INVALID;
    if (!body.province) errs.province = "استان را انتخاب کنید.";
    if (!body.city) errs.city = "شهر را وارد کنید.";
    if (!/^\d{10}$/.test(body.postal_code)) errs.postal_code = "کد پستی باید ۱۰ رقم باشد.";
    if (body.address_line.length < 5) errs.address_line = "نشانی کامل را وارد کنید.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(errs);
      return;
    }
    setBusy(true);
    const res = await apiFetch<Address>("/addresses/", { method: "POST", json: body });
    setBusy(false);
    if (res.ok) {
      onCreated(res.data);
      return;
    }
    const fe = fieldErrors(res.error) as Partial<Record<Field | "form", string>>;
    const known = ORDER.some((f) => fe[f]);
    const next = known ? fe : { form: errorMessage(res.error, "non_field_errors", "ذخیره آدرس انجام نشد. دوباره تلاش کنید.") };
    setErrors(next);
    focusFirst(next);
  }

  const err = (f: Field) =>
    errors[f] ? (
      <p id={`${id}-${f}-err`} className="mt-1.5 text-sm font-bold text-danger">
        {errors[f]}
      </p>
    ) : null;
  const a11y = (f: Field) => ({
    id: `${id}-${f}`,
    name: f,
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? `${id}-${f}-err` : undefined,
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4 rounded-card border border-line bg-surface p-4">
      <p className="text-base font-extrabold text-ink">آدرس جدید</p>
      {errors.form && (
        <p role="alert" tabIndex={-1} data-form-error className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {errors.form}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-recipient_name`} className="text-sm font-bold text-ink">
            نام و نام خانوادگی گیرنده
          </label>
          <input {...a11y("recipient_name")} type="text" autoComplete="name" defaultValue={defaultName} className={input} />
          {err("recipient_name")}
        </div>
        <div>
          <label htmlFor={`${id}-recipient_phone`} className="text-sm font-bold text-ink">
            موبایل گیرنده
          </label>
          <input
            {...a11y("recipient_phone")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            dir="ltr"
            defaultValue={toPersianDigits(defaultPhone)}
            className={`${input} text-end`}
          />
          {err("recipient_phone")}
        </div>
        <div>
          <label htmlFor={`${id}-province`} className="text-sm font-bold text-ink">
            استان
          </label>
          <select {...a11y("province")} defaultValue="" autoComplete="address-level1" className={input}>
            <option value="" disabled>
              انتخاب استان
            </option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {err("province")}
        </div>
        <div>
          <label htmlFor={`${id}-city`} className="text-sm font-bold text-ink">
            شهر
          </label>
          <input {...a11y("city")} type="text" autoComplete="address-level2" className={input} />
          {err("city")}
        </div>
        <div>
          <label htmlFor={`${id}-postal_code`} className="text-sm font-bold text-ink">
            کد پستی ۱۰ رقمی
          </label>
          <input
            {...a11y("postal_code")}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            dir="ltr"
            className={`${input} text-end tracking-wider`}
          />
          {err("postal_code")}
        </div>
        <div>
          <label htmlFor={`${id}-title`} className="text-sm font-bold text-ink">
            عنوان آدرس <span className="font-medium text-ink-muted">(اختیاری، مثل خانه)</span>
          </label>
          <input {...a11y("title")} type="text" className={input} />
          {err("title")}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-address_line`} className="text-sm font-bold text-ink">
            نشانی کامل
          </label>
          <textarea
            {...a11y("address_line")}
            rows={3}
            autoComplete="street-address"
            placeholder="خیابان، کوچه، پلاک، واحد"
            className={`${input} h-auto py-2 leading-7`}
          />
          {err("address_line")}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "در حال ذخیره…" : "ذخیره آدرس"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 items-center justify-center rounded-control border border-line-strong px-5 font-bold text-ink hover:bg-primary-soft"
          >
            انصراف
          </button>
        )}
      </div>
    </form>
  );
}
