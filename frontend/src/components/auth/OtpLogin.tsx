"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Me, OtpRequested, OtpVerified } from "@/lib/account-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import {
  PHONE_INVALID,
  cleanCode,
  formatCountdown,
  isValidPhone,
  normalizePhone,
} from "@/lib/otp";
import { receiveSmsCode } from "@/lib/webotp";
import { announceAuth } from "./auth-events";

interface OtpLoginProps {
  /** Called after a successful verify (cookies are already set). */
  onSuccess: (me: Me, isNew: boolean) => void;
  /** Heading level of the form title (the login page uses h1, checkout h3). */
  headingLevel?: 1 | 2 | 3;
  /** Hide the visible title (when the surrounding page already has one). */
  hideTitle?: boolean;
  autoFocus?: boolean;
}

const field =
  "mt-1.5 block h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted aria-[invalid=true]:border-danger";
const primaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 text-base font-extrabold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";
const linkBtn =
  "inline-flex min-h-11 items-center rounded-control px-2 text-sm font-bold text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline";

/** Re-render every second while `until` is in the future; returns the seconds left. */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    setNow(Date.now());
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [until]);
  return until == null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

function retryAfterSeconds(error: Record<string, unknown>): number | null {
  const r = Number(error.retry_after);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * Phone + one-time-code login, reusable (login page, checkout step 1).
 * Step 1: phone (Persian digits ok) → POST /auth/otp/request/. Step 2: code → POST /auth/otp/verify/,
 * resend countdown from `resend_in`, «ویرایش شماره», 429 `retry_after` handling.
 */
export function OtpLogin({ onSuccess, headingLevel = 2, hideTitle = false, autoFocus = true }: OtpLoginProps) {
  const id = useId();
  const H = `h${headingLevel}` as "h1" | "h2" | "h3";
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState(""); // the normalised number the code was sent to
  const [length, setLength] = useState(5);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendUntil, setResendUntil] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);
  // Bumped on every sent code so WebOTP listens for the newest SMS.
  const [sentNonce, setSentNonce] = useState(0);
  const verifyRef = useRef<(value: string) => void>(() => {});

  const resendLeft = useSecondsLeft(resendUntil);
  const blockedLeft = useSecondsLeft(blockedUntil);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (!autoFocus) return;
    }
    (step === "phone" ? phoneRef : codeRef).current?.focus();
  }, [step, autoFocus]);

  async function requestCode(target: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await apiFetch<OtpRequested>("/auth/otp/request/", { method: "POST", json: { phone: target } });
    setBusy(false);
    if (res.ok) {
      setPhone(res.data.phone || target);
      setLength(res.data.length > 0 ? res.data.length : 5);
      setResendUntil(Date.now() + Math.max(0, res.data.resend_in) * 1000);
      setBlockedUntil(null);
      setSentNonce((n) => n + 1);
      return true;
    }
    if (res.status === 429) {
      const wait = retryAfterSeconds(res.error) ?? 60;
      // Asked again for the number a code was just sent to (e.g. after «ویرایش شماره»): reuse that code.
      if (target === phone) {
        setResendUntil(Date.now() + wait * 1000);
        setNotice("کد قبلی هنوز معتبر است؛ همان را وارد کنید.");
        return true;
      }
      setBlockedUntil(Date.now() + wait * 1000);
      setError(errorMessage(res.error, undefined, "درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید."));
      return false;
    }
    setError(errorMessage(res.error, "phone", "ارسال کد انجام نشد. دوباره تلاش کنید."));
    return false;
  }

  async function onPhoneSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || blockedLeft > 0) return;
    const normalised = normalizePhone(phoneInput);
    if (!isValidPhone(normalised)) {
      setError(PHONE_INVALID);
      phoneRef.current?.focus();
      return;
    }
    if (await requestCode(normalised)) {
      setCode("");
      setStep("code");
    } else {
      phoneRef.current?.focus();
    }
  }

  async function verify(value: string) {
    if (busy) return;
    if (value.length !== length) {
      setError(`کد ${toPersianDigits(length)} رقمی را کامل وارد کنید.`);
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch<OtpVerified>("/auth/otp/verify/", { method: "POST", json: { phone, code: value } });
    if (res.ok) {
      announceAuth(res.data.user);
      onSuccess(res.data.user, res.data.is_new);
      return; // stay busy: the parent navigates or swaps the step
    }
    setBusy(false);
    setCode("");
    setError(
      res.status === 429
        ? errorMessage(res.error, undefined, "تلاش‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.")
        : errorMessage(res.error, "code", "کد واردشده درست نیست."),
    );
    codeRef.current?.focus();
  }

  verifyRef.current = (value: string) => void verify(value);

  // WebOTP (Android Chrome): fill and submit the code from the SMS's «@host #code» line.
  useEffect(() => {
    if (step !== "code") return;
    const ac = new AbortController();
    void receiveSmsCode(ac.signal, length).then((received) => {
      if (!received || ac.signal.aborted) return;
      setCode(received);
      setError(null);
      verifyRef.current(received);
    });
    return () => ac.abort();
  }, [step, length, sentNonce]);

  async function onResend() {
    if (busy || resendLeft > 0) return;
    if (await requestCode(phone)) {
      setCode("");
      setNotice("کد تازه ارسال شد.");
      codeRef.current?.focus();
    }
  }

  function editPhone() {
    setStep("phone");
    setError(null);
    setNotice(null);
    setCode("");
  }

  const errorId = `${id}-err`;
  const errorBox = (
    <p id={errorId} role="alert" aria-live="assertive" className={error ? "mt-2 text-sm font-bold text-danger" : "sr-only"}>
      {error ?? ""}
    </p>
  );

  if (step === "phone") {
    return (
      <form onSubmit={onPhoneSubmit} noValidate className="space-y-4">
        <div>
          {!hideTitle && <H className="text-lg font-extrabold text-ink">ورود یا ثبت‌نام</H>}
          <p className="mt-1 text-sm leading-7 text-ink-muted">
            شماره موبایل خود را وارد کنید تا کد تأیید برایتان پیامک شود. اگر حساب ندارید، همین حالا ساخته می‌شود.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className="text-sm font-bold text-ink">
            شماره موبایل
          </label>
          <input
            ref={phoneRef}
            id={`${id}-phone`}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            dir="ltr"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              if (error && blockedLeft === 0) setError(null);
            }}
            placeholder={toPersianDigits("09121234567")}
            aria-invalid={error && blockedLeft === 0 ? true : undefined}
            aria-describedby={`${id}-phone-hint ${errorId}`}
            className={`${field} text-end tracking-wider`}
          />
          <p id={`${id}-phone-hint`} className="mt-1 text-xs text-ink-muted">
            با ارقام فارسی یا انگلیسی؛ مثل ۰۹۱۲۱۲۳۴۵۶۷
          </p>
          {errorBox}
          {blockedLeft > 0 && (
            <p className="mt-1 text-sm text-ink-muted" aria-live="polite">
              تلاش دوباره تا <span dir="ltr">{formatCountdown(blockedLeft)}</span> دیگر
            </p>
          )}
        </div>
        <button type="submit" disabled={busy || blockedLeft > 0} className={primaryBtn}>
          {busy ? "در حال ارسال…" : "دریافت کد تأیید"}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      noValidate
      className="space-y-4"
    >
      <div>
        {!hideTitle && <H className="text-lg font-extrabold text-ink">کد تأیید را وارد کنید</H>}
        <p className="mt-1 text-sm leading-7 text-ink-muted">
          کد {toPersianDigits(length)} رقمی به شماره{" "}
          <span dir="ltr" className="font-bold text-ink">
            {toPersianDigits(phone)}
          </span>{" "}
          پیامک شد.
          <button type="button" onClick={editPhone} className={`${linkBtn} ms-1`}>
            ویرایش شماره
          </button>
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-code`} className="text-sm font-bold text-ink">
          کد تأیید
        </label>
        <input
          ref={codeRef}
          id={`${id}-code`}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={length * 2}
          value={toPersianDigits(code)}
          onChange={(e) => {
            const next = cleanCode(e.target.value, length);
            setCode(next);
            if (error) setError(null);
            if (next.length === length && !busy) void verify(next);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`${field} text-center text-xl font-bold tracking-[0.5em]`}
        />
        {errorBox}
        {notice && (
          <p className="mt-2 text-sm text-success" role="status">
            {notice}
          </p>
        )}
      </div>
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "در حال بررسی…" : "تأیید و ورود"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onResend} disabled={busy || resendLeft > 0} className={linkBtn}>
          ارسال دوباره کد
        </button>
        {resendLeft > 0 && (
          <span className="text-ink-muted" aria-hidden="true">
            <span dir="ltr">{formatCountdown(resendLeft)}</span> تا ارسال دوباره
          </span>
        )}
        {/* Announced once when the wait starts and once when it ends — not every second. */}
        <span className="sr-only" aria-live="polite">
          {resendLeft > 0
            ? `ارسال دوباره کد تا ${toPersianDigits(Math.ceil(resendLeft / 60))} دقیقه دیگر ممکن است.`
            : "اکنون می‌توانید کد را دوباره دریافت کنید."}
        </span>
      </div>
    </form>
  );
}
