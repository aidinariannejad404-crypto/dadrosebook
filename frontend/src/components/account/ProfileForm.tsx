"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Me } from "@/lib/account-types";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";

const INPUT =
  "mt-1 block h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink aria-[invalid=true]:border-danger";

/** First/last name editor (PATCH /me/). Opens by itself for new users without a name. */
export function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const id = useId();
  const empty = !me.first_name && !me.last_name;
  const [open, setOpen] = useState(empty);
  const [first, setFirst] = useState(me.first_name);
  const [last, setLast] = useState(me.last_name);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    const res = await apiFetch<Me>("/me/", {
      method: "PATCH",
      json: { first_name: first.trim(), last_name: last.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(fieldErrors(res.error));
      setMessage(errorMessage(res.error));
      return;
    }
    setMessage("نام شما ذخیره شد.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage("");
          }}
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft"
        >
          ویرایش نام
        </button>
        <p role="status" aria-live="polite" className="text-sm font-bold text-success">
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-2 rounded-card border border-line bg-surface-muted p-4">
      {empty && <p className="mb-3 text-sm leading-7 text-ink">نام خود را وارد کنید تا سفارش‌ها و نظرهایتان با نام شما ثبت شود.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-first`} className="text-sm font-bold text-ink">
            نام
          </label>
          <input
            id={`${id}-first`}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            autoComplete="given-name"
            maxLength={150}
            aria-invalid={errors.first_name ? true : undefined}
            aria-describedby={errors.first_name ? `${id}-first-err` : undefined}
            className={INPUT}
          />
          {errors.first_name && (
            <p id={`${id}-first-err`} className="mt-1 text-xs font-bold text-danger">
              {errors.first_name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-last`} className="text-sm font-bold text-ink">
            نام خانوادگی
          </label>
          <input
            id={`${id}-last`}
            value={last}
            onChange={(e) => setLast(e.target.value)}
            autoComplete="family-name"
            maxLength={150}
            aria-invalid={errors.last_name ? true : undefined}
            aria-describedby={errors.last_name ? `${id}-last-err` : undefined}
            className={INPUT}
          />
          {errors.last_name && (
            <p id={`${id}-last-err`} className="mt-1 text-xs font-bold text-danger">
              {errors.last_name}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "در حال ذخیره…" : "ذخیره نام"}
        </button>
        {!empty && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-control px-4 font-bold text-ink-muted hover:bg-primary-soft"
          >
            انصراف
          </button>
        )}
        <p role="status" aria-live="polite" className="text-sm font-bold text-danger">
          {message}
        </p>
      </div>
    </form>
  );
}
