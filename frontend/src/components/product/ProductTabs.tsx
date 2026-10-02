"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs (automatic activation). All panels stay in the DOM (hidden), so the content is
 * server-rendered and indexable.
 */
export function ProductTabs({ tabs }: { tabs: TabDef[] }) {
  const uid = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setActive(n);
    refs.current[n]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // RTL: ArrowLeft moves to the next tab visually
    const map: Record<string, () => void> = {
      ArrowLeft: () => focusTab(active + 1),
      ArrowRight: () => focusTab(active - 1),
      Home: () => focusTab(0),
      End: () => focusTab(tabs.length - 1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="اطلاعات کتاب"
        onKeyDown={onKeyDown}
        className="relative no-scrollbar flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${uid}-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`${uid}-panel-${t.key}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`-mb-px min-h-12 shrink-0 whitespace-nowrap border-b-[3px] px-4 text-sm font-bold transition-colors ${
              i === active ? "border-accent text-primary" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.key}
          id={`${uid}-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${t.key}`}
          hidden={i !== active}
          tabIndex={0}
          className="py-5 focus-visible:outline-offset-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
