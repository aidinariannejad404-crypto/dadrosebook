"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import type { GoalState } from "@/lib/study";

/** Change the daily goal (default 20 minutes) and the review-SMS preference. */
export function GoalEditor({ goal, choices, reviewSms }: { goal: number; choices: number[]; reviewSms: boolean }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(goal);
  const [sms, setSms] = useState(reviewSms);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const options = choices.includes(goal) ? choices : [...choices, goal].sort((a, b) => a - b);

  async function save(next: { daily_goal_minutes?: number; review_sms?: boolean }) {
    setBusy(true);
    setMsg("");
    const res = await apiFetch<GoalState>("/study/goal/", { method: "PATCH", json: next });
    setBusy(false);
    if (!res.ok) {
      setMsg(errorMessage(res.error, "daily_goal_minutes", "ذخیره نشد. دوباره تلاش کنید."));
      return;
    }
    setMsg("ذخیره شد.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-bold text-ink">
          هدف روزانه
        </label>
        <select
          id={id}
          value={value}
          disabled={busy}
          onChange={(e) => {
            const v = Number(e.target.value);
            setValue(v);
            void save({ daily_goal_minutes: v });
          }}
          className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm text-ink focus:border-primary"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {toPersianDigits(m)} دقیقه
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={sms}
          disabled={busy}
          onChange={(e) => {
            setSms(e.target.checked);
            void save({ review_sms: e.target.checked });
          }}
          className="size-5 accent-[color:var(--color-primary)]"
        />
        پیامک «این کتاب چقدر کمک کرد؟» را برایم بفرست
      </label>
      <p role="status" aria-live="polite" className="text-xs font-bold text-ink-muted empty:hidden">
        {msg}
      </p>
    </div>
  );
}
