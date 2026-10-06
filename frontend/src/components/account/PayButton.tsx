"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/session";

/** Retry payment for a PENDING_PAYMENT order: POST /orders/<number>/pay/ → gateway. */
export function PayButton({ number, className = "" }: { number: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    const res = await apiFetch<{ payment_url: string | null }>(`/orders/${encodeURIComponent(number)}/pay/`, {
      method: "POST",
    });
    if (res.ok && res.data.payment_url) {
      window.location.assign(res.data.payment_url);
      return;
    }
    setBusy(false);
    setError(res.ok ? "اتصال به درگاه پرداخت برقرار نشد. دوباره تلاش کنید." : errorMessage(res.error));
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-6 text-base font-bold text-white hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
      >
        {busy ? "در حال انتقال به درگاه…" : "پرداخت"}
      </button>
      <p role="alert" aria-live="assertive" className="mt-2 text-sm font-bold text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
