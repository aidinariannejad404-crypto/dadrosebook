"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/Icons";

const OPEN_DELAY = 120;
const CLOSE_DELAY = 300;

/**
 * Desktop mega menu disclosure. The panel content is server-rendered (`children`).
 * Opens on click / Enter / Space, or on hover with intent delays; closes on Esc (focus returns to
 * the button), on focus leaving the menu, on pointer leave (300ms) and on navigation.
 * The panel is positioned against the nearest `relative` ancestor (the CategoryNav bar).
 */
export function MegaMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pathname = usePathname();

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      ref={root}
      className="hidden md:block"
      onPointerEnter={(e) => e.pointerType === "mouse" && schedule(true, OPEN_DELAY)}
      onPointerLeave={(e) => e.pointerType === "mouse" && schedule(false, CLOSE_DELAY)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          window.clearTimeout(timer.current);
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-control bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover aria-expanded:bg-primary-hover"
      >
        {label}
        <ChevronIcon size={16} className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="absolute inset-x-0 top-full z-30 border-b border-line bg-surface shadow-raised"
      >
        {children}
      </div>
    </div>
  );
}
