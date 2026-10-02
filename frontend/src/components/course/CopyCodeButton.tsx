"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/Icons";

/** Copies a discount code; the result is announced politely («کپی شد»). */
export function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      // older browsers / insecure origins: select a temporary field and use the legacy command
      try {
        const field = document.createElement("textarea");
        field.value = code;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        ok = document.execCommand("copy");
        field.remove();
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "manual");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={copy}
        className="group inline-flex min-h-12 items-center justify-between gap-3 rounded-control border-2 border-dashed border-accent-strong bg-surface ps-4 pe-3 font-bold text-ink transition-colors hover:bg-accent-soft"
      >
        <span dir="ltr" className="font-mono text-lg font-black tracking-[0.12em]">
          {code}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-white">
          {state === "copied" ? <CheckIcon size={15} strokeWidth={2.6} /> : <CopyIcon size={15} />}
          {state === "copied" ? "کپی شد" : "کپی کد"}
        </span>
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-5 text-xs font-bold ${state === "manual" ? "text-ink-muted" : "text-success"}`}
      >
        {state === "copied" ? "کد تخفیف کپی شد" : state === "manual" ? "کد را انتخاب و دستی کپی کنید" : ""}
      </p>
    </div>
  );
}
