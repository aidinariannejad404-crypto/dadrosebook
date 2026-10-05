"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";
import { requestBackInStock } from "@/lib/cart-client";
import { routes } from "@/lib/config";
import { normalizeMobile, PHONE_ERROR } from "@/lib/phone";
import type { BackInStockRequestBody, VariantType } from "@/lib/types";
import { BellIcon, CheckIcon } from "./Icons";
import { Dialog } from "./Dialog";

interface NotifyMeButtonProps {
  bookId: number;
  bookTitle: string;
  /** the out-of-stock variant to watch; without it the dialog sends the visitor to the product page */
  variantId?: number;
  /** product page link when no variantId is known (cards) */
  bookSlug?: string;
  /** e.g. "PRINT" */
  variantType?: VariantType;
  /** an ebook of the same book is available right now */
  ebookAvailable?: boolean;
  source?: BackInStockRequestBody["source"];
  className?: string;
  size?: "sm" | "md";
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string; field: boolean };

/** «موجود شد خبرم کن»: phone number → POST /back-in-stock/; an SMS goes out when the print edition is back. */
export function NotifyMeButton({
  bookId,
  bookTitle,
  variantId,
  bookSlug,
  variantType = "PRINT",
  ebookAvailable = false,
  source = "product",
  className = "",
  size = "md",
}: NotifyMeButtonProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (variantId == null || status.kind === "busy") return;
    const phone = normalizeMobile(String(new FormData(e.currentTarget).get("phone") ?? ""));
    if (!phone) {
      setStatus({ kind: "error", message: PHONE_ERROR, field: true });
      e.currentTarget.querySelector<HTMLInputElement>('input[name="phone"]')?.focus();
      return;
    }
    setStatus({ kind: "busy" });
    const r = await requestBackInStock({ variant_id: variantId, phone, source });
    if (r.ok) {
      setStatus({ kind: "done", message: r.data.message || "درخواست شما ثبت شد." });
      track("notify_me_requested", { item_id: bookId, item_name: bookTitle, variant: variantType, source });
    } else {
      setStatus({ kind: "error", message: r.detail, field: r.code === "phone" });
    }
  }

  const close = () => {
    setOpen(false);
    if (status.kind !== "done") setStatus({ kind: "idle" });
  };
  const errorId = `${uid}-error`;
  const fieldError = status.kind === "error" && status.field;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-primary bg-surface font-bold text-primary transition-colors hover:bg-primary-soft ${
          size === "sm" ? "whitespace-nowrap px-2 text-xs" : "px-5 text-base"
        } ${className}`}
      >
        <BellIcon size={size === "sm" ? 16 : 20} className="shrink-0" />
        موجود شد خبرم کن
      </button>
      <Dialog open={open} onClose={close} title="موجود شد خبرم کن">
        {open && (
          <>
            {status.kind === "done" ? (
              <div role="status" className="flex items-start gap-2 rounded-control bg-success-soft px-3 py-3 leading-7 text-success">
                <CheckIcon size={20} strokeWidth={2.6} className="mt-1 shrink-0" />
                <p className="font-bold">{status.message}</p>
              </div>
            ) : variantId == null ? (
              <p className="leading-8">
                نسخه چاپی «{bookTitle}» در حال حاضر موجود نیست. برای ثبت شماره موبایل و دریافت پیامک هنگام موجود شدن، صفحه
                کتاب را باز کنید.
              </p>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <p className="leading-8">
                  نسخه چاپی «{bookTitle}» در حال حاضر موجود نیست. شماره موبایل خود را وارد کنید تا به محض موجود شدن، پیامک
                  بفرستیم.
                </p>
                <label htmlFor={`${uid}-phone`} className="mt-3 block text-sm font-bold">
                  شماره موبایل
                </label>
                <input
                  id={`${uid}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                  aria-invalid={fieldError || undefined}
                  aria-describedby={status.kind === "error" ? errorId : undefined}
                  className="mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-start text-base text-ink aria-[invalid=true]:border-danger"
                />
                {status.kind === "error" && (
                  <p id={errorId} role="alert" className="mt-2 text-sm font-bold text-danger">
                    {status.message}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={status.kind === "busy"}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-70"
                >
                  <BellIcon size={20} className="shrink-0" />
                  {status.kind === "busy" ? "در حال ثبت…" : "خبرم کن"}
                </button>
              </form>
            )}
            {ebookAvailable && (
              <p className="mt-3 rounded-control bg-success-soft px-3 py-2 text-sm leading-7 text-success">
                نسخه الکترونیک این کتاب همین حالا موجود است.
              </p>
            )}
            {(status.kind === "done" || variantId == null) && (
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {variantId == null && bookSlug && (
                  <Link
                    href={routes.product(bookSlug)}
                    className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
                  >
                    صفحه کتاب
                  </Link>
                )}
                <button
                  type="button"
                  onClick={close}
                  className={`min-h-11 rounded-control px-5 font-bold ${
                    variantId == null && bookSlug ? "border border-line-strong text-ink hover:bg-primary-soft" : "bg-primary text-white hover:bg-primary-hover"
                  }`}
                >
                  {status.kind === "done" ? "بستن" : "متوجه شدم"}
                </button>
              </div>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
