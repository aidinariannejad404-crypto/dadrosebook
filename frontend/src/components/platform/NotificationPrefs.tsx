"use client";

import { useState } from "react";
import type { NotificationPreference } from "@/lib/platform-types";
import { apiFetch, errorMessage } from "@/lib/session";

function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:cursor-not-allowed"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-7 w-12 rounded-full border-2 transition-colors ${
          on ? "border-primary bg-primary" : "border-line-strong bg-bg"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full shadow-card transition-[inset-inline-start] ${
            on ? "start-[1.4rem] bg-surface" : "start-0.5 bg-ink-muted"
          }`}
        />
      </span>
    </button>
  );
}

/** PF-3 «اعلان‌ها»: marketing kinds switch on/off; service messages are listed as always on. */
export function NotificationPrefs({ initial }: { initial: NotificationPreference[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function toggle(row: NotificationPreference) {
    setBusy(row.kind);
    setStatus("");
    const res = await apiFetch<NotificationPreference[]>("/me/notification-settings/", {
      method: "PATCH",
      json: { changes: { [row.kind]: !row.enabled } },
    });
    setBusy(null);
    if (res.ok) {
      setRows(res.data);
      setStatus(`«${row.label}» ${row.enabled ? "خاموش" : "روشن"} شد.`);
    } else {
      setStatus(errorMessage(res.error));
    }
  }

  const marketing = rows.filter((r) => r.marketing);
  const service = rows.filter((r) => !r.marketing);
  return (
    <div className="space-y-6">
      <section aria-labelledby="prefs-marketing" className="rounded-card bg-surface p-4 shadow-card">
        <h2 id="prefs-marketing" className="text-base font-extrabold text-ink">
          پیشنهادها و یادآوری‌ها
        </h2>
        <p className="mt-1 text-sm text-ink-muted">این پیام‌ها را هر وقت خواستید خاموش کنید؛ پیامک و پیام داخل حساب هر دو قطع می‌شوند.</p>
        <ul className="mt-2 divide-y divide-line">
          {marketing.map((r) => (
            <li key={r.kind} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm font-bold text-ink">{r.label}</span>
              <Switch on={r.enabled} label={r.label} disabled={busy === r.kind} onToggle={() => toggle(r)} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="prefs-service" className="rounded-card bg-surface p-4 shadow-card">
        <h2 id="prefs-service" className="text-base font-extrabold text-ink">
          پیام‌های خدماتی (همیشه روشن)
        </h2>
        <p className="mt-1 text-sm text-ink-muted">برای پیگیری سفارش و حساب شما لازم‌اند و خاموش نمی‌شوند. کد ورود همیشه از خط خدماتی فرستاده می‌شود.</p>
        <ul className="mt-2 divide-y divide-line">
          {service.map((r) => (
            <li key={r.kind} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-ink">{r.label}</span>
              <Switch on label={`${r.label} (همیشه روشن)`} disabled />
            </li>
          ))}
        </ul>
      </section>
      <p role="status" aria-live="polite" className="text-sm font-bold text-success empty:hidden">
        {status}
      </p>
    </div>
  );
}
