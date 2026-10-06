"use client";

import { useId, useState } from "react";
import { apiFetch } from "@/lib/session";
import type { ReminderConsent } from "@/lib/trust-types";

/** د۳/د۴ SMS study-reminder opt-in in the account (same flag as the post-purchase page). */
export function ReminderToggle({ initial }: { initial: ReminderConsent }) {
  const id = useId();
  const [on, setOn] = useState(initial.sms);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function change(next: boolean) {
    setOn(next);
    setNote(null);
    const res = await apiFetch<ReminderConsent>("/me/study-reminders/", { method: "PUT", json: { sms: next, source: "account" } });
    if (res.ok) {
      setOn(res.data.sms);
      setNote({ ok: true, text: res.data.sms ? "یادآور مطالعه فعال شد." : "یادآور مطالعه خاموش شد." });
    } else {
      setOn(!next);
      setNote({ ok: false, text: "ذخیره نشد. دوباره تلاش کنید." });
    }
  }
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-7 text-ink">
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => void change(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
        />
        <span>
          <span className="block font-bold">یادآور پیامکی مطالعه</span>
          <span className="block text-xs text-ink-muted">برای برنامه مطالعه و روزهای مانده تا آزمون؛ هر وقت بخواهید خاموشش کنید.</span>
        </span>
      </label>
      <p role="status" className={`text-xs font-bold empty:hidden ${note?.ok ? "text-success" : "text-danger"}`}>
        {note?.text}
      </p>
    </div>
  );
}
