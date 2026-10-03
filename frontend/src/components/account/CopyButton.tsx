"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/Icons";

/** Copies a value (e.g. a tracking code); the result is announced politely. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "manual");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        aria-label={`کپی ${label}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 text-sm font-bold text-primary hover:bg-primary-soft"
      >
        {state === "copied" ? <CheckIcon size={16} strokeWidth={2.6} /> : <CopyIcon size={16} />}
        {state === "copied" ? "کپی شد" : "کپی"}
      </button>
      <span role="status" aria-live="polite" className="text-xs font-bold text-ink-muted">
        {state === "copied" ? `${label} کپی شد` : state === "manual" ? "کد را انتخاب و دستی کپی کنید" : ""}
      </span>
    </span>
  );
}
