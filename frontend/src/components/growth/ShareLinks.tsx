"use client";

import { useEffect, useRef, useState } from "react";
import { shareIntents } from "@/lib/growth";
import { CopyIcon } from "@/components/ui/Icons";

export type ShareChannel = "telegram" | "whatsapp" | "copy";

const btn =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control border px-3 text-sm font-bold transition-colors";

/** «ارسال به گروه مطالعه»: Telegram / WhatsApp share intents and «کپی لینک» for an absolute URL. */
export function ShareLinks({
  url,
  text,
  onShare,
  className = "",
}: {
  url: string;
  text: string;
  onShare?: (channel: ShareChannel) => void;
  className?: string;
}) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const intents = shareIntents(url, text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("لینک کپی شد");
      onShare?.("copy");
    } catch {
      setStatus("کپی نشد؛ لینک را از کادر بالا انتخاب و کپی کنید");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 3000);
  }

  return (
    <div className={className}>
      <label className="sr-only" htmlFor={`share-${url}`}>
        لینک
      </label>
      <input
        id={`share-${url}`}
        readOnly
        dir="ltr"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="block h-11 w-full rounded-control border border-line bg-bg px-3 text-sm text-ink"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={intents.telegram}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onShare?.("telegram")}
          className={`${btn} border-primary bg-primary text-white hover:bg-primary-hover`}
        >
          تلگرام
        </a>
        <a
          href={intents.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onShare?.("whatsapp")}
          className={`${btn} border-primary text-primary hover:bg-primary-soft`}
        >
          واتس‌اپ
        </a>
        <button type="button" onClick={copy} className={`${btn} border-line-strong text-ink hover:bg-bg`}>
          <CopyIcon size={16} />
          کپی لینک
        </button>
      </div>
      <p aria-live="polite" className="mt-1 min-h-5 text-xs font-bold text-success">
        {status}
      </p>
    </div>
  );
}
