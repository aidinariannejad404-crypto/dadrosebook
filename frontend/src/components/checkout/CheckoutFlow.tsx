"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Address,
  CheckoutCreated,
  CheckoutRequest,
  Me,
  Quote,
  ShippingOption,
} from "@/lib/account-types";
import { itemsKey, resolveCheckoutItems, type ResolvedItems } from "@/lib/checkout-items";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";
import { ShieldIcon } from "@/components/ui/Icons";
import { OtpLogin } from "@/components/auth/OtpLogin";
import { announceAuth } from "@/components/auth/auth-events";
import { checkoutKeyFor } from "./checkout-key";
import {
  DiscountField,
  EbookNowNote,
  FreeShippingHint,
  OrderLines,
  OrphanProblems,
  Totals,
} from "./CheckoutSummary";
import { ShippingStep } from "./ShippingStep";
import { STEP_LABEL, Stepper, type StepId, type StepState } from "./Stepper";

const QUOTE_DEBOUNCE_MS = 300;
const GATEWAY_ERROR = "اتصال به درگاه پرداخت برقرار نشد. چند لحظه بعد دوباره تلاش کنید.";

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 text-base font-extrabold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-card bg-surface p-4 shadow-card md:p-5">{children}</div>;
}

/**
 * The 3-step checkout: «ورود» (OTP, skipped when logged in) → «ارسال» (address + method, skipped for
 * ebook-only) → «پرداخت» (summary, discount, pay). Every change re-quotes (POST /checkout/quote/, debounced).
 */
export function CheckoutFlow({ search }: { search: string }) {
  const router = useRouter();

  const [resolved, setResolved] = useState<ResolvedItems | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [step, setStep] = useState<StepId | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [discountCode, setDiscountCode] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [options, setOptions] = useState<ShippingOption[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null);
  const [shippingNonce, setShippingNonce] = useState(0);

  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const items = resolved?.items;
  const loggedIn = me != null;
  const selectedAddress = addresses?.find((a) => a.id === selectedAddressId) ?? null;

  // 1. items + who is here
  useEffect(() => {
    let alive = true;
    void resolveCheckoutItems(search).then((r) => alive && setResolved(r));
    void apiFetch<Me>("/me/").then((r) => {
      if (!alive) return;
      setMe(r.ok ? r.data : null);
    });
    return () => {
      alive = false;
    };
  }, [search]);

  // 2. quote on every change (debounced, latest wins)
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!items || items.length === 0 || me === undefined) return;
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = window.setTimeout(async () => {
      const body: CheckoutRequest = { items, discount_code: discountCode };
      if (loggedIn && selectedAddressId != null) {
        body.address_id = selectedAddressId;
        if (selectedMethodId != null) body.shipping_method_id = selectedMethodId;
      }
      const res = await apiFetch<Quote>("/checkout/quote/", { method: "POST", json: body });
      if (seq !== quoteSeq.current) return;
      setQuoting(false);
      if (res.ok) {
        setQuote(res.data);
        setQuoteError(null);
      } else {
        setQuoteError(errorMessage(res.error, "items", "محاسبه مبلغ سفارش انجام نشد."));
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [items, me, loggedIn, selectedAddressId, selectedMethodId, discountCode, quoteNonce]);

  const needsShipping = quote?.needs_shipping ?? false;

  // 3. first step once we know the user and the quote
  useEffect(() => {
    if (step != null || me === undefined || !quote) return;
    setStep(!me ? "login" : quote.needs_shipping ? "shipping" : "payment");
  }, [step, me, quote]);

  // 4. addresses + provinces (logged in, shipping needed)
  useEffect(() => {
    if (!loggedIn || !needsShipping) return;
    let alive = true;
    setAddressesError(null);
    void apiFetch<Address[]>("/addresses/").then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setAddressesError(errorMessage(r.error, undefined, "دریافت آدرس‌ها انجام نشد."));
        return;
      }
      setAddresses(r.data);
      setSelectedAddressId((cur) =>
        cur != null && r.data.some((a) => a.id === cur) ? cur : (r.data.find((a) => a.is_default) ?? r.data[0])?.id ?? null,
      );
    });
    void apiFetch<string[]>("/addresses/provinces/").then((r) => alive && r.ok && setProvinces(r.data));
    return () => {
      alive = false;
    };
  }, [loggedIn, needsShipping, shippingNonce]);

  // 5. shipping methods for the chosen address
  const province = selectedAddress?.province ?? null;
  const subtotal = quote?.items_total ?? 0;
  useEffect(() => {
    if (!province || !needsShipping) return;
    let alive = true;
    setOptionsLoading(true);
    setOptionsError(null);
    const qs = new URLSearchParams({ province, subtotal: String(subtotal) });
    void apiFetch<ShippingOption[]>(`/shipping-methods/?${qs}`).then((r) => {
      if (!alive) return;
      setOptionsLoading(false);
      if (!r.ok) {
        setOptionsError(errorMessage(r.error, undefined, "دریافت روش‌های ارسال انجام نشد."));
        return;
      }
      setOptions(r.data);
      setSelectedMethodId((cur) => (cur != null && r.data.some((m) => m.id === cur) ? cur : (r.data[0]?.id ?? null)));
    });
    return () => {
      alive = false;
    };
  }, [province, subtotal, needsShipping, shippingNonce]);

  // focus the step heading whenever the step changes (not on the first render)
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef<StepId | null>(null);
  useEffect(() => {
    if (step && prevStep.current && prevStep.current !== step) headingRef.current?.focus();
    prevStep.current = step;
  }, [step]);

  const onLoggedIn = useCallback(
    (user: Me) => {
      setMe(user);
      setStep(quote?.needs_shipping ? "shipping" : "payment");
    },
    [quote],
  );

  const states: Record<StepId, StepState> = useMemo(() => {
    const s: Record<StepId, StepState> = { login: "upcoming", shipping: "upcoming", payment: "upcoming" };
    s.login = step === "login" ? "current" : loggedIn ? "done" : "upcoming";
    if (quote && !quote.needs_shipping) s.shipping = "skipped";
    else s.shipping = step === "shipping" ? "current" : step === "payment" ? "done" : "upcoming";
    s.payment = step === "payment" ? "current" : "upcoming";
    return s;
  }, [step, loggedIn, quote]);

  const blocked = !quote || quoting || quote.problems.length > 0 || (quote.needs_shipping && !quote.shipping);
  const shippingReady =
    selectedAddressId != null && selectedMethodId != null && !showForm && quote?.shipping?.id === selectedMethodId && !quoting;

  async function pay() {
    if (!items || !quote || !me || blocked || paying) return;
    setPaying(true);
    setPayError(null);
    const code = discountCode && !quote.discount_error ? discountCode : null;
    const fingerprint = [
      itemsKey(items),
      `u${me.id}`,
      quote.needs_shipping ? `a${selectedAddressId}m${selectedMethodId}` : "",
      code ?? "",
    ].join("|");
    const body: CheckoutRequest = {
      items,
      discount_code: code,
      customer_note: note.trim().slice(0, 500),
      checkout_key: checkoutKeyFor(fingerprint),
    };
    if (quote.needs_shipping) {
      body.address_id = selectedAddressId;
      body.shipping_method_id = selectedMethodId;
    }
    const res = await apiFetch<CheckoutCreated>("/checkout/", { method: "POST", json: body });
    if (res.ok) {
      const { order, payment_url } = res.data;
      if (payment_url) window.location.assign(payment_url);
      else router.push(`${routes.checkoutResult}?order=${encodeURIComponent(order.number)}&status=paid`);
      return; // keep the button busy while leaving
    }
    setPaying(false);
    if (res.status === 401) {
      announceAuth(null);
      setMe(null);
      setStep("login");
      return;
    }
    if (res.status === 400) {
      if (Array.isArray(res.error.problems)) {
        setPayError("برخی اقلام سفارش دیگر قابل خرید نیستند. موارد مشخص‌شده را بررسی کنید.");
      } else if (res.error.discount_code) {
        setPayError(errorMessage(res.error, "discount_code"));
      } else {
        const fe = fieldErrors(res.error);
        if (fe.address_id || fe.shipping_method_id) setStep("shipping");
        setPayError(Object.values(fe)[0] ?? "ثبت سفارش انجام نشد. دوباره تلاش کنید.");
      }
      setQuoteNonce((n) => n + 1);
      return;
    }
    // 502: the gateway refused; the order stays PENDING_PAYMENT and the same checkout_key retries it.
    setPayError(errorMessage(res.error, undefined, GATEWAY_ERROR));
  }

  // ---------- render ----------

  if (resolved && resolved.items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold text-ink">کتابی برای خرید انتخاب نشده است</h1>
        <p className="mt-2 leading-8 text-ink-muted">از صفحه هر کتاب، نسخه دلخواه را انتخاب کنید و «خرید» را بزنید.</p>
        <Link href={routes.home} className={`${primaryBtn} mt-6`}>
          مشاهده کتاب‌ها
        </Link>
      </div>
    );
  }

  const loading = !resolved || me === undefined || (!quote && !quoteError);
  const total = quote ? formatToman(quote.total) : "—";

  let action: ReactNode = null;
  if (step === "shipping") {
    action = (
      <button type="button" disabled={!shippingReady} onClick={() => setStep("payment")} className={`${primaryBtn} w-full`}>
        ادامه و پرداخت
      </button>
    );
  } else if (step === "payment") {
    action = (
      <button type="button" disabled={blocked || paying} onClick={pay} className={`${primaryBtn} w-full`}>
        <ShieldIcon size={20} />
        {paying ? "در حال انتقال…" : payError ? "تلاش دوباره" : quote?.total === 0 ? "ثبت سفارش" : "پرداخت امن با زرین‌پال"}
      </button>
    );
  }

  const heading = (id: StepId, n: number) => (
    <h2 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-ink focus:outline-none">
      <span className="sr-only">مرحله {toPersianDigits(n)}: </span>
      {id === "login" ? "ورود یا ثبت‌نام" : id === "shipping" ? "آدرس و روش ارسال" : "بازبینی و پرداخت"}
    </h2>
  );

  return (
    <div className="mx-auto max-w-site px-4 pb-4 pt-5 md:pt-8">
      <h1 className="sr-only">تکمیل خرید</h1>
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-6">
        <div className="space-y-4">
          <Panel>
            <Stepper states={states} />
          </Panel>

          {quoteError && (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
              {quoteError}{" "}
              <button type="button" onClick={() => setQuoteNonce((n) => n + 1)} className="min-h-11 underline underline-offset-4">
                تلاش دوباره
              </button>
            </p>
          )}

          {loading && !quoteError && (
            <Panel>
              <p className="text-sm text-ink-muted" role="status">
                در حال آماده‌سازی سفارش…
              </p>
            </Panel>
          )}

          {quote && step && step !== "payment" && (
            <details className="rounded-card bg-surface p-4 shadow-card md:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center font-bold text-ink">
                اقلام سفارش ({toPersianDigits(quote.lines.length)})
              </summary>
              <div className="mt-3">
                <OrderLines quote={quote} />
              </div>
            </details>
          )}

          {quote && step === "login" && (
            <Panel>
              <section aria-labelledby="co-step">
                <div id="co-step">{heading("login", 1)}</div>
                <p className="mt-1 text-sm text-ink-muted">برای ثبت سفارش و دسترسی به کتاب‌های الکترونیک وارد شوید.</p>
                <div className="mt-4">
                  <OtpLogin onSuccess={onLoggedIn} headingLevel={3} hideTitle autoFocus={false} />
                </div>
              </section>
            </Panel>
          )}

          {quote && me && step === "shipping" && (
            <Panel>
              <section aria-labelledby="co-step" className="space-y-4">
                <div id="co-step">{heading("shipping", 2)}</div>
                <ShippingStep
                  me={me}
                  addresses={addresses}
                  addressesError={addressesError}
                  selectedAddressId={selectedAddressId}
                  onSelectAddress={setSelectedAddressId}
                  onAddressCreated={(a) => {
                    setAddresses((prev) => [...(prev ?? []), a]);
                    setSelectedAddressId(a.id);
                    setShowForm(false);
                  }}
                  showForm={showForm}
                  setShowForm={setShowForm}
                  provinces={provinces}
                  options={options}
                  optionsError={optionsError}
                  optionsLoading={optionsLoading}
                  selectedMethodId={selectedMethodId}
                  onSelectMethod={setSelectedMethodId}
                  onRetry={() => setShippingNonce((n) => n + 1)}
                />
                <FreeShippingHint quote={quote} />
              </section>
            </Panel>
          )}

          {quote && me && step === "payment" && (
            <Panel>
              <section aria-labelledby="co-step" className="space-y-5">
                <div id="co-step">{heading("payment", 3)}</div>

                {quote.needs_shipping && (
                  <div className="flex items-start justify-between gap-3 rounded-control bg-bg px-3 py-2.5 text-sm leading-7">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">ارسال به: {selectedAddress?.title || selectedAddress?.recipient_name}</p>
                      <p className="text-ink-muted">
                        {selectedAddress && `${selectedAddress.province}، ${selectedAddress.city}، ${selectedAddress.address_line}`}
                      </p>
                      {quote.shipping && <p className="text-ink-muted">{quote.shipping.name}</p>}
                      {/* د۲ (impl/trust) */}
                      {quote.shipping?.delivery_estimate && (
                        <p className="font-bold text-ink">تحویل تقریبی: {quote.shipping.delivery_estimate.label}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep("shipping")}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 font-bold text-primary hover:bg-primary-soft"
                    >
                      تغییر
                    </button>
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-base font-extrabold text-ink">اقلام سفارش</h3>
                  <OrderLines quote={quote} />
                </div>
                <OrphanProblems quote={quote} />
                {quote.problems.length > 0 && (
                  <p role="alert" className="text-sm font-bold text-danger">
                    تا رفع موارد بالا پرداخت ممکن نیست؛ اقلام ناموجود را از سفارش حذف کنید.
                  </p>
                )}

                <DiscountField
                  applied={discountCode}
                  error={discountCode ? quote.discount_error : null}
                  busy={quoting}
                  onApply={setDiscountCode}
                />
                <FreeShippingHint quote={quote} />
                <EbookNowNote quote={quote} />

                <div className="md:hidden">
                  <Totals quote={quote} showShipping />
                </div>

                <div>
                  <label htmlFor="co-note" className="text-sm font-bold text-ink">
                    توضیحات سفارش <span className="font-medium text-ink-muted">(اختیاری)</span>
                  </label>
                  <textarea
                    id="co-note"
                    rows={2}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base leading-7 text-ink"
                  />
                </div>

                <div aria-live="assertive">
                  {payError && (
                    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold leading-7 text-danger">
                      {payError}
                    </p>
                  )}
                </div>
                <p className="flex items-center gap-2 text-xs text-ink-muted">
                  <ShieldIcon size={16} className="shrink-0 text-primary" />
                  پرداخت از طریق درگاه امن زرین‌پال با همه کارت‌های عضو شتاب انجام می‌شود.
                </p>
              </section>
            </Panel>
          )}
        </div>

        {/* desktop summary + action */}
        <aside aria-label="خلاصه سفارش" className="hidden md:sticky md:top-4 md:block">
          <Panel>
            <h2 className="mb-3 text-base font-extrabold text-ink">خلاصه سفارش</h2>
            {quote ? (
              <div className="space-y-4">
                <OrderLines quote={quote} compact />
                <Totals quote={quote} showShipping={step === "payment" || step === "shipping"} />
                {action}
                {step === "login" && <p className="text-sm text-ink-muted">برای ادامه، وارد حساب خود شوید.</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">در حال محاسبه…</p>
            )}
          </Panel>
        </aside>
      </div>

      {/* mobile sticky bar: total + the step's primary action */}
      {quote && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-surface shadow-raised pb-safe md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0 shrink-0">
              <p className="text-xs text-ink-muted">مبلغ قابل پرداخت</p>
              <p className="text-base font-black text-ink" aria-live="polite">
                {total}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              {action ?? <p className="text-end text-xs text-ink-muted">مرحله «{STEP_LABEL.login}» را کامل کنید</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
