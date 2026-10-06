"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/Icons";

/**
 * Long text clipped to ~8 lines with a fade and a «بیشتر بخوانید / بستن» toggle. The full content is
 * in the server HTML (SEO); the clip is applied only after hydration and only when it is taller
 * than the limit, so short text and no-JS visitors see everything.
 */
export function CollapsibleText({ children, className = "", collapsedRem = 16 }: { children: ReactNode; className?: string; collapsedRem?: number }) {
  const id = useId();
  const inner = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const check = () => {
      const limit = collapsedRem * parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
      // a little slack: don't hide just one more line behind a button
      setLong(el.scrollHeight > limit * 1.25);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsedRem]);

  const clipped = long && !open;
  return (
    <div className={className}>
      <div
        id={id}
        className="relative overflow-hidden"
        style={clipped ? { maxHeight: `${collapsedRem}rem` } : undefined}
      >
        <div ref={inner}>{children}</div>
        {clipped && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg to-transparent"
          />
        )}
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-bold text-primary hover:bg-primary-soft"
        >
          {open ? "بستن" : "بیشتر بخوانید"}
          <ChevronIcon size={18} className={open ? "rotate-90" : "-rotate-90"} />
        </button>
      )}
    </div>
  );
}
