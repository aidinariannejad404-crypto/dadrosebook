"use client";

import { useEffect, useRef, useState } from "react";

const ShareIcon = ({ size = 22 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.3 10.8 7.4-4.4M8.3 13.2l7.4 4.4" />
  </svg>
);

/**
 * Share the product (Telegram/WhatsApp groups of candidates): Web Share API on phones, copy the
 * link elsewhere. The outcome is announced politely.
 */
export function ShareButton({ url, title, text, className = "" }: { url: string; title: string; text?: string; className?: string }) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function say(message: string) {
    setStatus(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 3000);
  }

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say("لینک کتاب کپی شد");
    } catch {
      say("کپی نشد؛ نشانی صفحه را از نوار مرورگر کپی کنید");
    }
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => void share()}
        aria-label={`اشتراک‌گذاری «${title}»`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-primary"
      >
        <ShareIcon />
      </button>
      <span
        role="status"
        aria-live="polite"
        className={
          status
            ? "absolute end-0 top-full z-20 mt-1 whitespace-nowrap rounded-control bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-raised"
            : "sr-only"
        }
      >
        {status}
      </span>
    </span>
  );
}
