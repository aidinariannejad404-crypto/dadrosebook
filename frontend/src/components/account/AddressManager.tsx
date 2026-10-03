"use client";

import { useId, useState } from "react";
import type { Address, AddressInput } from "@/lib/account-types";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { MapPinIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/Icons";

const MAX_ADDRESSES = 10;

const EMPTY: AddressInput = {
  title: "",
  recipient_name: "",
  recipient_phone: "",
  province: "",
  city: "",
  postal_code: "",
  address_line: "",
  is_default: false,
};

const INPUT =
  "mt-1 block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink aria-[invalid=true]:border-danger";

function toInput(a: Address): AddressInput {
  return {
    title: a.title,
    recipient_name: a.recipient_name,
    recipient_phone: a.recipient_phone,
    province: a.province,
    city: a.city,
    postal_code: a.postal_code,
    address_line: a.address_line,
    is_default: a.is_default,
  };
}

type Editing = { id: number | null; values: AddressInput } | null;

/** Address book: list, add/edit in a dialog, set default, delete with confirmation. */
export function AddressManager({ initial, provinces }: { initial: Address[]; provinces: string[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function reload(msg: string) {
    const res = await apiFetch<Address[]>("/addresses/");
    if (res.ok) setAddresses(res.data);
    setStatus(msg);
  }

  async function makeDefault(a: Address) {
    setBusyId(a.id);
    setStatus("");
    const res = await apiFetch<Address>(`/addresses/${a.id}/`, { method: "PATCH", json: { is_default: true } });
    setBusyId(null);
    if (!res.ok) return setStatus(errorMessage(res.error));
    await reload(`«${a.title || a.city}» نشانی پیش‌فرض شد.`);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    setDeleteError("");
    const res = await apiFetch<void>(`/addresses/${deleting.id}/`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok && res.status !== 404) return setDeleteError(errorMessage(res.error));
    setDeleting(null);
    await reload("نشانی حذف شد.");
  }

  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {addresses.length > 0
            ? `${toPersianDigits(addresses.length)} نشانی ثبت شده (حداکثر ${toPersianDigits(MAX_ADDRESSES)})`
            : "هنوز نشانی‌ای ثبت نکرده‌اید."}
        </p>
        <button
          type="button"
          disabled={full}
          onClick={() => setEditing({ id: null, values: { ...EMPTY, is_default: addresses.length === 0 } })}
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          <PlusIcon size={18} />
          افزودن نشانی
        </button>
      </div>
      <p role="status" aria-live="polite" className="mb-3 text-sm font-bold text-success empty:hidden">
        {status}
      </p>

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-4 py-10 text-center">
          <MapPinIcon size={36} className="text-primary" />
          <p className="mt-3 max-w-sm text-sm leading-7 text-ink-muted">
            نشانی‌های خود را یک بار ثبت کنید تا هنگام خرید نسخه چاپی فقط انتخابشان کنید.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col rounded-card bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-ink">{a.title || "نشانی"}</h2>
                {a.is_default && (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">پیش‌فرض</span>
                )}
              </div>
              <p className="mt-2 text-sm leading-7 text-ink">
                {a.province}، {a.city}، {toPersianDigits(a.address_line)}
              </p>
              <dl className="mt-1 space-y-0.5 text-xs text-ink-muted">
                <div className="flex gap-1">
                  <dt>گیرنده:</dt>
                  <dd className="text-ink">
                    {a.recipient_name} · <bdi>{toPersianDigits(a.recipient_phone)}</bdi>
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>کد پستی:</dt>
                  <dd className="text-ink">
                    <bdi>{toPersianDigits(a.postal_code)}</bdi>
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => setEditing({ id: a.id, values: toInput(a) })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft"
                  aria-label={`ویرایش نشانی ${a.title || a.city}`}
                >
                  <PencilIcon size={16} />
                  ویرایش
                </button>
                {!a.is_default && (
                  <button
                    type="button"
                    onClick={() => makeDefault(a)}
                    disabled={busyId === a.id}
                    className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft disabled:opacity-60"
                    aria-label={`پیش‌فرض کردن نشانی ${a.title || a.city}`}
                  >
                    پیش‌فرض شود
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setDeleting(a);
                  }}
                  className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft"
                  aria-label={`حذف نشانی ${a.title || a.city}`}
                >
                  <TrashIcon size={16} />
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "ویرایش نشانی" : "افزودن نشانی"}
      >
        {editing && (
          <AddressForm
            key={editing.id ?? "new"}
            editing={editing}
            provinces={provinces}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              const wasNew = editing.id == null;
              setEditing(null);
              await reload(wasNew ? "نشانی جدید ثبت شد." : "نشانی ویرایش شد.");
            }}
          />
        )}
      </Dialog>

      <Dialog open={deleting != null} onClose={() => setDeleting(null)} title="حذف نشانی">
        {deleting && (
          <>
            <p className="leading-8">
              نشانی «{deleting.title || deleting.city}» حذف شود؟ این کار برگشت‌پذیر نیست.
            </p>
            <p role="alert" className="mt-2 text-sm font-bold text-danger empty:hidden">
              {deleteError}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="min-h-11 rounded-control px-4 font-bold text-ink-muted hover:bg-primary-soft"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyId === deleting.id}
                className="min-h-11 rounded-control bg-danger px-5 font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busyId === deleting.id ? "در حال حذف…" : "حذف نشانی"}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function AddressForm({
  editing,
  provinces,
  onCancel,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  provinces: string[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const id = useId();
  const [values, setValues] = useState<AddressInput>(editing.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError("");
    const res = await apiFetch<Address>(editing.id ? `/addresses/${editing.id}/` : "/addresses/", {
      method: editing.id ? "PATCH" : "POST",
      json: values,
    });
    setBusy(false);
    if (!res.ok) {
      const fe = fieldErrors(res.error);
      setErrors(fe);
      const known = Object.keys(fe).some((k) => k in EMPTY);
      setFormError(known ? "لطفاً خطاهای فرم را برطرف کنید." : errorMessage(res.error));
      return;
    }
    await onSaved();
  }

  const field = (
    name: Exclude<keyof AddressInput, "is_default" | "province" | "address_line">,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={`${id}-${name}`} className="text-sm font-bold text-ink">
        {label}
      </label>
      <input
        id={`${id}-${name}`}
        value={values[name]}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-err` : undefined}
        className={INPUT}
        {...extra}
      />
      {errors[name] && (
        <p id={`${id}-${name}-err`} className="mt-1 text-xs font-bold text-danger">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {field("title", "عنوان (مثلاً خانه یا محل کار)", { maxLength: 50, placeholder: "خانه" })}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("recipient_name", "نام و نام خانوادگی گیرنده", { autoComplete: "name", required: true })}
        {field("recipient_phone", "موبایل گیرنده", {
          inputMode: "tel",
          autoComplete: "tel",
          dir: "ltr",
          placeholder: "۰۹۱۲۱۲۳۴۵۶۷",
          required: true,
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-province`} className="text-sm font-bold text-ink">
            استان
          </label>
          <select
            id={`${id}-province`}
            value={values.province}
            onChange={(e) => set("province", e.target.value)}
            required
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? `${id}-province-err` : undefined}
            className={INPUT}
          >
            <option value="">انتخاب استان</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {values.province && !provinces.includes(values.province) && (
              <option value={values.province}>{values.province}</option>
            )}
          </select>
          {errors.province && (
            <p id={`${id}-province-err`} className="mt-1 text-xs font-bold text-danger">
              {errors.province}
            </p>
          )}
        </div>
        {field("city", "شهر", { autoComplete: "address-level2", required: true })}
      </div>
      <div>
        <label htmlFor={`${id}-address_line`} className="text-sm font-bold text-ink">
          نشانی کامل
        </label>
        <textarea
          id={`${id}-address_line`}
          value={values.address_line}
          onChange={(e) => set("address_line", e.target.value)}
          rows={3}
          required
          autoComplete="street-address"
          placeholder="خیابان، کوچه، پلاک، واحد"
          aria-invalid={errors.address_line ? true : undefined}
          aria-describedby={errors.address_line ? `${id}-address_line-err` : undefined}
          className={`${INPUT} py-2 leading-7`}
        />
        {errors.address_line && (
          <p id={`${id}-address_line-err`} className="mt-1 text-xs font-bold text-danger">
            {errors.address_line}
          </p>
        )}
      </div>
      {field("postal_code", "کد پستی ۱۰ رقمی", { inputMode: "numeric", dir: "ltr", autoComplete: "postal-code", required: true })}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-ink">
        <input
          type="checkbox"
          checked={values.is_default}
          onChange={(e) => set("is_default", e.target.checked)}
          className="h-5 w-5 accent-[var(--color-primary)]"
        />
        نشانی پیش‌فرض من باشد
      </label>
      <p role="alert" className="text-sm font-bold text-danger empty:hidden">
        {formError}
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-control px-4 font-bold text-ink-muted hover:bg-primary-soft">
          انصراف
        </button>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "در حال ذخیره…" : "ذخیره نشانی"}
        </button>
      </div>
    </form>
  );
}
