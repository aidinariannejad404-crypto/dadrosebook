"use client";

import { useEffect, useState } from "react";
import { countdownTo } from "@/lib/growth";
import { toPersianDigits } from "@/lib/format";

/** Live countdown (days · hours · minutes) to `iso`; server-rendered with the server's clock. */
export function CampaignCountdown({ iso, serverNow, label }: { iso: string; serverNow: number; label: string }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const left = countdownTo(iso, now);
  if (left.done) return null;
  const parts: [number, string][] = [
    [left.days, "روز"],
    [left.hours, "ساعت"],
    [left.minutes, "دقیقه"],
  ];
  return (
    <div role="timer" aria-label={`${label}: ${toPersianDigits(left.days)} روز و ${toPersianDigits(left.hours)} ساعت`}>
      <p className="text-sm font-bold text-white/90">{label}</p>
      <div className="mt-1.5 flex gap-2" aria-hidden="true">
        {parts.map(([value, unit]) => (
          <span key={unit} className="flex min-w-14 flex-col items-center rounded-control bg-white/15 px-2 py-1.5">
            <span className="text-xl font-black leading-7 text-white">{toPersianDigits(value)}</span>
            <span className="text-[0.6875rem] text-white/85">{unit}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
