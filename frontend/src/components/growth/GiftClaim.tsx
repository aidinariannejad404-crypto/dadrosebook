"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Address, Me } from "@/lib/account-types";
import { trackGiftClaimed } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import type { Gift } from "@/lib/growth";
import { apiFetch, errorMessage } from "@/lib/session";
import { SHORT_LABEL } from "@/lib/variants";
import { OtpLogin } from "@/components/auth/OtpLogin";
import { AddressForm } from "@/components/checkout/AddressForm";
import { MiniCover } from "@/components/checkout/MiniCover";
import { BookOpenIcon, CheckIcon, TruckIcon } from "@/components/ui/Icons";

const primaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 text-base font-extrabold text-white hover:bg-primary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/**
 * و۴ `/gift/<token>`: the recipient sees who sent what, logs in with phone OTP, picks an address when
 * there is a print book, and claims. Claiming twice is harmless (the server is idempotent).
 */
export function GiftClaim({ initial }: { initial: Gift }) {
  const uid = useId();
  const [gift, setGift] = useState(initial);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/me/").then((r) => setMe(r.ok ? r.data : null));
  }, []);

  // refresh with the session (claimed_by_me) once we know who is here
  useEffect(() => {
    if (!me) return;
    void apiFetch<Gift>(`/growth/gifts/${encodeURIComponent(initial.token)}/`).then((r) => r.ok && setGift(r.data));
  }, [me, initial.token]);

  const needsAddress = gift.needs_address && gift.state === "active";
  useEffect(() => {
    if (!me || !needsAddress) return;
    void apiFetch<Address[]>("/addresses/").then((r) => {
      if (!r.ok) return;
      setAddresses(r.data);
      setAddressId((r.data.find((a) => a.is_default) ?? r.data[0])?.id ?? null);
      if (r.data.length === 0) setShowForm(true);
    });
    void apiFetch<string[]>("/addresses/provinces/").then((r) => r.ok && setProvinces(r.data));
  }, [me, needsAddress]);

  async function claim() {
    if (busy || (needsAddress && addressId == null)) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<Gift>(`/growth/gifts/${encodeURIComponent(gift.token)}/claim/`, {
      method: "POST",
      json: needsAddress ? { address_id: addressId } : {},
    });
    setBusy(false);
    if (res.ok) {
      setGift(res.data);
      trackGiftClaimed({ has_ebook: res.data.has_ebook, needs_address: res.data.needs_address, items: res.data.items.length });
      return;
    }
    if (res.status === 401) {
      setMe(null);
      return;
    }
    setError(errorMessage(res.error, undefined, "دریافت هدیه انجام نشد. دوباره تلاش کنید."));
  }

  const done = gift.state === "claimed" && gift.claimed_by_me;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section aria-labelledby="gift-title" className="rounded-card bg-primary px-5 py-6 text-center text-white shadow-card">
        <p aria-hidden="true" className="text-4xl">
          🎁
        </p>
        <h1 id="gift-title" className="mt-2 text-xl font-black leading-9">
          {gift.recipient_name ? `${gift.recipient_name} عزیز، ` : ""}
          {gift.sender_name} برایتان کتاب هدیه فرستاده است
        </h1>
        {gift.message && (
          <blockquote className="mx-auto mt-3 max-w-md rounded-control bg-white/10 px-4 py-3 leading-8 text-white/95">
            «{gift.message}»
          </blockquote>
        )}
      </section>

      <section aria-labelledby="gift-items" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        <h2 id="gift-items" className="mb-3 font-extrabold text-ink">
          هدیه شما
        </h2>
        <ul className="divide-y divide-line">
          {gift.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <MiniCover title={it.title} cover={it.cover} subjectColor={it.subject_color} className="w-12" />
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-7 text-ink">{it.title}</p>
                <p className="text-sm text-ink-muted">
                  {SHORT_LABEL[it.variant_type]}
                  {it.quantity > 1 && ` · ${toPersianDigits(it.quantity)} عدد`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-live="polite" className="rounded-card bg-surface p-4 shadow-card md:p-5">
        {done ? (
          <div className="text-center">
            <p className="flex items-center justify-center gap-2 text-lg font-black text-success">
              <CheckIcon size={24} strokeWidth={2.6} />
              هدیه را دریافت کردید
            </p>
            {gift.needs_address && (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-sm leading-7 text-ink">
                <TruckIcon size={18} className="text-primary" />
                نسخه چاپی به نشانی شما ارسال می‌شود؛ کد رهگیری پیامک خواهد شد.
              </p>
            )}
            {gift.has_ebook && (
              <Link href={routes.library} className={`${primaryBtn} mt-4`}>
                <BookOpenIcon size={20} />
                رفتن به کتابخانه من
              </Link>
            )}
          </div>
        ) : gift.state === "claimed" ? (
          <p className="text-center font-bold text-ink">این هدیه قبلاً دریافت شده است.</p>
        ) : gift.state === "expired" ? (
          <p className="text-center font-bold text-danger">مهلت دریافت این هدیه تمام شده است. با پشتیبانی تماس بگیرید.</p>
        ) : gift.state === "cancelled" ? (
          <p className="text-center font-bold text-danger">این هدیه لغو شده است.</p>
        ) : gift.state === "pending" ? (
          <p className="text-center font-bold text-ink">این هدیه هنوز پرداخت نشده است.</p>
        ) : me === undefined ? (
          <p role="status" className="text-center text-ink-muted">
            در حال آماده‌سازی…
          </p>
        ) : me === null ? (
          <div>
            <h2 className="font-extrabold text-ink">برای دریافت هدیه وارد شوید</h2>
            <p className="mt-1 text-sm leading-7 text-ink-muted">
              با شماره موبایل خودتان وارد شوید؛ {gift.has_ebook ? "کتاب الکترونیک به کتابخانه همین حساب اضافه می‌شود." : "سفارش به نام شما ثبت می‌شود."}
            </p>
            <div className="mt-4">
              <OtpLogin onSuccess={setMe} headingLevel={3} hideTitle autoFocus={false} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {gift.expires_at && (
              <p className="text-sm text-ink-muted">مهلت دریافت: {formatJalaliDate(gift.expires_at)}</p>
            )}
            {needsAddress && (
              <fieldset>
                <legend className="mb-2 font-extrabold text-ink">نشانی ارسال نسخه چاپی</legend>
                {addresses == null && <p className="text-sm text-ink-muted">در حال دریافت نشانی‌ها…</p>}
                <div className="grid gap-2">
                  {addresses?.map((a) => (
                    <label key={a.id} className="relative block">
                      <input
                        type="radio"
                        name={`${uid}-addr`}
                        checked={addressId === a.id}
                        onChange={() => setAddressId(a.id)}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-14 cursor-pointer flex-col rounded-control border-2 border-line p-3 text-sm leading-7 peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                        <span className="font-bold text-ink">{a.title || a.recipient_name}</span>
                        <span className="text-ink-muted">
                          {a.province}، {a.city}، {a.address_line}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {showForm ? (
                  <div className="mt-3">
                    <AddressForm
                      provinces={provinces}
                      defaultPhone={me.phone}
                      defaultName={me.full_name}
                      onCreated={(a) => {
                        setAddresses((prev) => [...(prev ?? []), a]);
                        setAddressId(a.id);
                        setShowForm(false);
                      }}
                      onCancel={addresses && addresses.length > 0 ? () => setShowForm(false) : undefined}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="mt-2 inline-flex min-h-11 items-center rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
                  >
                    + افزودن نشانی جدید
                  </button>
                )}
              </fieldset>
            )}
            {error && (
              <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={claim}
              aria-disabled={busy || (needsAddress && addressId == null) || undefined}
              className={primaryBtn}
            >
              {busy ? "در حال ثبت…" : "دریافت هدیه"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
