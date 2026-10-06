"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { OtpRequested } from "@/lib/account-types";
import { apiFetch, errorMessage } from "@/lib/session";
import { otpHelpVisible } from "@/lib/otp-help";
import { formatCountdown } from "@/lib/otp";
import { trackOtpHelp } from "@/lib/analytics";

/**
 * PF-1 «کد نیامد؟»: one minute after a code was sent, a help link explains that login codes come
 * from the service line (delivered even when advertising SMS are blocked), offers a resend and —
 * only when the backend enables it — a voice call.
 */
export function OtpHelp({
  phone,
  sentAt,
  resendLeft,
  voiceAvailable,
  onResend,
  onVoiceSent,
}: {
  phone: string;
  sentAt: number | null;
  resendLeft: number;
  voiceAvailable: boolean;
  onResend: () => void;
  onVoiceSent: (data: OtpRequested) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (sentAt == null || otpHelpVisible(sentAt, Date.now())) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (otpHelpVisible(sentAt, Date.now())) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [sentAt]);

  if (!otpHelpVisible(sentAt, now)) return null;

  async function voice() {
    setBusy(true);
    setNote("");
    const res = await apiFetch<OtpRequested>("/auth/otp/voice/", { method: "POST", json: { phone } });
    setBusy(false);
    if (res.ok) {
      onVoiceSent(res.data);
      setNote("تا چند ثانیه دیگر تماس گرفته می‌شود و کد خوانده می‌شود.");
    } else setNote(errorMessage(res.error));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackOtpHelp({ voice_available: voiceAvailable });
        }}
        className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-bold text-primary underline-offset-4 hover:underline"
      >
        کد نیامد؟
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="کد تأیید نرسیده است؟" placement="sheet">
        <ul className="list-disc space-y-2 ps-5 text-sm leading-7 text-ink">
          <li>کد ورود از <strong>خط خدماتی</strong> فرستاده می‌شود؛ حتی اگر پیامک‌های تبلیغاتی را مسدود کرده باشید، باید برسد.</li>
          <li>شماره واردشده را دوباره نگاه کنید؛ اگر اشتباه است «ویرایش شماره» را بزنید.</li>
          <li>گاهی پیامک تا یک دقیقه طول می‌کشد. پر بودن حافظه پیامک یا نبودن آنتن هم دیر رسیدن را توضیح می‌دهد.</li>
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={resendLeft > 0}
            onClick={() => {
              setOpen(false);
              onResend();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-white disabled:opacity-60"
          >
            {resendLeft > 0 ? (
              <>
                ارسال دوباره پیامک تا <span dir="ltr" className="ms-1">{formatCountdown(resendLeft)}</span>
              </>
            ) : (
              "ارسال دوباره پیامک"
            )}
          </button>
          {voiceAvailable && (
            <button
              type="button"
              disabled={busy}
              onClick={voice}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-primary px-5 font-bold text-primary disabled:opacity-60"
            >
              {busy ? "در حال درخواست…" : "دریافت کد با تماس صوتی"}
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-ink empty:hidden">
          {note}
        </p>
      </Dialog>
    </>
  );
}
