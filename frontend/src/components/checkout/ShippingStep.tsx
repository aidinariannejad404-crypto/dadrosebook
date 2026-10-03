"use client";

import { useId } from "react";
import type { Address, Me, ShippingOption } from "@/lib/account-types";
import { formatToman, toPersianDigits } from "@/lib/format";
import { CheckIcon, TruckIcon } from "@/components/ui/Icons";
import { AddressForm } from "./AddressForm";

const card =
  "flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-control border-2 border-line bg-surface p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-line-strong";

interface ShippingStepProps {
  me: Me;
  addresses: Address[] | null;
  addressesError: string | null;
  selectedAddressId: number | null;
  onSelectAddress: (id: number) => void;
  onAddressCreated: (a: Address) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  provinces: string[];
  options: ShippingOption[] | null;
  optionsError: string | null;
  optionsLoading: boolean;
  selectedMethodId: number | null;
  onSelectMethod: (id: number) => void;
  onRetry: () => void;
}

/** Step 2: address radio cards (or an inline new-address form) and shipping-method radio cards. */
export function ShippingStep(p: ShippingStepProps) {
  const uid = useId();
  const hasAddresses = (p.addresses?.length ?? 0) > 0;
  const formOpen = p.showForm || (p.addresses != null && !hasAddresses);

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-base font-extrabold text-ink">آدرس تحویل</legend>
        {p.addressesError && (
          <p role="alert" className="mb-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
            {p.addressesError}{" "}
            <button type="button" onClick={p.onRetry} className="min-h-11 underline underline-offset-4">
              تلاش دوباره
            </button>
          </p>
        )}
        {p.addresses == null && !p.addressesError && <p className="text-sm text-ink-muted">در حال دریافت آدرس‌ها…</p>}
        {hasAddresses && (
          <div className="grid gap-2 sm:grid-cols-2">
            {p.addresses!.map((a) => (
              <label key={a.id} className="relative block">
                <input
                  type="radio"
                  name={`${uid}-address`}
                  value={a.id}
                  checked={p.selectedAddressId === a.id}
                  onChange={() => p.onSelectAddress(a.id)}
                  className="peer sr-only"
                />
                <span className={card}>
                  <span className="min-w-0 flex-1 text-sm leading-7">
                    <span className="block font-extrabold text-ink">
                      {a.title || a.recipient_name}
                      {a.is_default && (
                        <span className="ms-2 rounded-full bg-neutral-soft px-2 py-0.5 text-[0.6875rem] font-bold text-ink-muted">
                          پیش‌فرض
                        </span>
                      )}
                    </span>
                    <span className="block text-ink">
                      {a.province}، {a.city}، {a.address_line}
                    </span>
                    <span className="block text-ink-muted">
                      {a.recipient_name} · <span dir="ltr">{toPersianDigits(a.recipient_phone)}</span> · کد پستی{" "}
                      {toPersianDigits(a.postal_code)}
                    </span>
                  </span>
                </span>
                {p.selectedAddressId === a.id && (
                  <span aria-hidden="true" className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-white">
                    <CheckIcon size={13} strokeWidth={3} />
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
        {hasAddresses && !formOpen && (
          <button
            type="button"
            onClick={() => p.setShowForm(true)}
            className="mt-3 inline-flex min-h-11 items-center rounded-control border border-dashed border-line-strong px-4 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            + افزودن آدرس جدید
          </button>
        )}
      </fieldset>

      {formOpen && (
        <AddressForm
          provinces={p.provinces}
          defaultPhone={p.me.phone}
          defaultName={p.me.full_name}
          onCreated={p.onAddressCreated}
          onCancel={hasAddresses ? () => p.setShowForm(false) : undefined}
        />
      )}

      {p.selectedAddressId != null && !formOpen && (
        <fieldset aria-busy={p.optionsLoading || undefined}>
          <legend className="mb-2 text-base font-extrabold text-ink">روش ارسال</legend>
          {p.optionsError && (
            <p role="alert" className="mb-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
              {p.optionsError}{" "}
              <button type="button" onClick={p.onRetry} className="min-h-11 underline underline-offset-4">
                تلاش دوباره
              </button>
            </p>
          )}
          {p.options == null && !p.optionsError && <p className="text-sm text-ink-muted">در حال دریافت روش‌های ارسال…</p>}
          {p.options?.length === 0 && (
            <p className="text-sm text-ink-muted">برای این آدرس روش ارسالی فعال نیست. با پشتیبانی تماس بگیرید.</p>
          )}
          <div className="grid gap-2">
            {p.options?.map((m) => (
              <label key={m.id} className="relative block">
                <input
                  type="radio"
                  name={`${uid}-method`}
                  value={m.id}
                  checked={p.selectedMethodId === m.id}
                  onChange={() => p.onSelectMethod(m.id)}
                  className="peer sr-only"
                />
                <span className={card}>
                  <TruckIcon size={22} className="mt-0.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 text-sm leading-7">
                    <span className="block font-extrabold text-ink">{m.name}</span>
                    {m.eta_note && <span className="block text-ink-muted">{m.eta_note}</span>}
                    {m.description && <span className="block text-ink-muted">{m.description}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold">
                    {m.price === 0 ? (
                      <span className="text-success">
                        رایگان
                        {m.base_price > 0 && (
                          <del className="ms-1 block text-xs font-medium text-ink-muted">{formatToman(m.base_price)}</del>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink">{formatToman(m.price)}</span>
                    )}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
