"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "@/lib/account-types";
import { track } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { formatJalaliDate, formatToman, toPersianDigits } from "@/lib/format";
import { apiFetch, errorMessage } from "@/lib/session";
import { BookOpenIcon, CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/Icons";
import { InstallPrompt } from "@/components/platform/InstallPrompt"; // platform stream (PF-14)
import { clearCheckoutKeys } from "./checkout-key";

export type ResultStatus = "paid" | "failed" | "cancelled" | "pending";

const PAID_LIKE: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/** The order's own status wins over the URL (the callback already verified it). */
export function effectiveStatus(urlStatus: ResultStatus, order: Order | null): ResultStatus {
  if (!order) return urlStatus;
  if (PAID_LIKE.includes(order.status)) return "paid";
  if (order.status === "FAILED") return "failed";
  if (order.status === "CANCELLED") return "cancelled";
  // PENDING_PAYMENT: a failed/cancelled callback leaves it payable; otherwise still being checked.
  return urlStatus === "paid" ? "pending" : urlStatus;
}

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border-2 border-primary px-5 font-bold text-primary hover:bg-primary-soft disabled:opacity-60";

/** /checkout/result?order=…&status=paid|failed|cancelled */
export function PaymentResult({ orderNumber, status: urlStatus }: { orderNumber: string; status: ResultStatus }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(Boolean(orderNumber));
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (!orderNumber) return;
    setLoading(true);
    const res = await apiFetch<Order>(`/orders/${encodeURIComponent(orderNumber)}/`);
    setLoading(false);
    if (res.ok) setOrder(res.data);
  }, [orderNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = effectiveStatus(urlStatus, order);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading, status]);

  // purchase analytics: once per order (sessionStorage guard against refreshes)
  useEffect(() => {
    if (status !== "paid" || !orderNumber || loading) return;
    clearCheckoutKeys();
    const guard = `dr_purchase_tracked:${orderNumber}`;
    try {
      if (sessionStorage.getItem(guard)) return;
      sessionStorage.setItem(guard, "1");
    } catch {
      // without storage we still track once per mount
    }
    track("purchase", {
      transaction_id: orderNumber,
      value: order?.total ?? null,
      currency: "IRT",
      items: order?.items_count ?? null,
      discount_code: order?.discount_code || null,
    });
  }, [status, orderNumber, loading, order]);

  async function retry() {
    if (!orderNumber || retrying) return;
    setRetrying(true);
    setRetryError(null);
    const res = await apiFetch<{ payment_url: string | null }>(`/orders/${encodeURIComponent(orderNumber)}/pay/`, {
      method: "POST",
    });
    if (res.ok && res.data.payment_url) {
      window.location.assign(res.data.payment_url);
      return;
    }
    setRetrying(false);
    if (res.ok) {
      await load();
      return;
    }
    setRetryError(
      res.status === 401
        ? "برای پرداخت دوباره، ابتدا وارد حساب خود شوید."
        : errorMessage(res.error, undefined, "اتصال به درگاه پرداخت برقرار نشد. چند لحظه بعد دوباره تلاش کنید."),
    );
  }

  if (loading) {
    return (
      <Shell>
        <p role="status" className="text-center text-ink-muted">
          در حال دریافت وضعیت سفارش…
        </p>
      </Shell>
    );
  }

  const number = order?.number ?? orderNumber;
  const numberLine = number ? (
    <p className="mt-2 text-sm text-ink-muted">
      شماره سفارش:{" "}
      <span dir="ltr" className="font-bold text-ink">
        {toPersianDigits(number)}
      </span>
    </p>
  ) : null;

  if (status === "paid") {
    const canRead = order?.items.some((i) => i.can_read) ?? false;
    return (
      <Shell>
        <Badge tone="success">
          <CheckIcon size={32} strokeWidth={2.6} />
        </Badge>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-extrabold text-ink focus:outline-none">
          پرداخت با موفقیت انجام شد
        </h1>
        {numberLine}
        {order?.payment?.ref_id && (
          <p className="mt-1 text-sm text-ink-muted">
            کد پیگیری پرداخت:{" "}
            <span dir="ltr" className="font-bold text-ink">
              {toPersianDigits(order.payment.ref_id)}
            </span>
          </p>
        )}
        {order && (
          <p className="mt-1 text-sm text-ink-muted">
            مبلغ: <span className="font-bold text-ink">{formatToman(order.total)}</span>
            {order.paid_at && <> · {formatJalaliDate(order.paid_at)}</>}
          </p>
        )}
        {canRead && (
          <div className="mt-5 rounded-control bg-success-soft px-4 py-3 text-success">
            <p className="flex items-center justify-center gap-2 font-bold">
              <BookOpenIcon size={20} />
              کتاب‌های الکترونیک شما آماده مطالعه است
            </p>
            <Link href={routes.library} className={`${primaryBtn} mt-3 w-full`}>
              رفتن به کتابخانه من
            </Link>
          </div>
        )}
        {/* platform stream (PF-14): «نصب کتابخوان» after an ebook purchase */}
        {canRead && (
          <div className="mt-4 text-start empty:hidden">
            <InstallPrompt placement="purchase" />
          </div>
        )}
        {order?.needs_shipping && (
          <p className="mt-4 text-sm leading-7 text-ink">
            نسخه چاپی سفارش شما آماده ارسال می‌شود؛ کد رهگیری مرسوله پیامک خواهد شد.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {number && order && (
            <Link href={routes.order(number)} className={canRead ? secondaryBtn : primaryBtn}>
              مشاهده سفارش
            </Link>
          )}
          <Link href={routes.home} className={secondaryBtn}>
            بازگشت به فروشگاه
          </Link>
        </div>
      </Shell>
    );
  }

  if (status === "pending") {
    return (
      <Shell>
        <Badge tone="info">
          <ClockIcon size={30} />
        </Badge>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-extrabold text-ink focus:outline-none">
          در حال بررسی پرداخت
        </h1>
        {numberLine}
        <p className="mt-3 leading-8 text-ink-muted">
          نتیجه پرداخت هنوز از درگاه به ما نرسیده است. چند لحظه بعد وضعیت را دوباره بررسی کنید.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => void load()} className={primaryBtn}>
            بررسی دوباره
          </button>
          {number && order && (
            <Link href={routes.order(number)} className={secondaryBtn}>
              مشاهده سفارش
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  // failed / cancelled
  const canRetry = order ? order.can_pay : Boolean(orderNumber);
  return (
    <Shell>
      <Badge tone="danger">
        <CloseIcon size={30} strokeWidth={2.4} />
      </Badge>
      <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-extrabold text-ink focus:outline-none">
        پرداخت انجام نشد
      </h1>
      {numberLine}
      <p className="mt-3 leading-8 text-ink-muted">
        {status === "cancelled" ? "پرداخت لغو شد." : "پرداخت توسط درگاه تأیید نشد."} اگر مبلغی از حساب شما کم شده، حداکثر تا
        ۷۲ ساعت بازمی‌گردد.
      </p>
      <div aria-live="assertive">
        {retryError && (
          <p role="alert" className="mt-4 rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
            {retryError}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {canRetry ? (
          <button type="button" onClick={retry} disabled={retrying} className={primaryBtn}>
            {retrying ? "در حال انتقال به درگاه…" : "تلاش دوباره"}
          </button>
        ) : (
          <Link href={routes.home} className={primaryBtn}>
            بازگشت به فروشگاه
          </Link>
        )}
        {number && order && (
          <Link href={routes.order(number)} className={secondaryBtn}>
            مشاهده سفارش
          </Link>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 md:py-16">
      <div className="rounded-card bg-surface p-6 text-center shadow-card md:p-8">{children}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "danger" | "info"; children: React.ReactNode }) {
  const cls = { success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" }[tone];
  return (
    <span aria-hidden="true" className={`mx-auto grid size-16 place-items-center rounded-full ${cls}`}>
      {children}
    </span>
  );
}
