"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { DEFAULT_ORDERING, ORDERINGS, type Ordering } from "@/lib/discovery";

interface SortSelectProps {
  action: string;
  value: Ordering;
  /** the rest of the query (page dropped) */
  hidden: [string, string][];
}

/**
 * Sort as a GET form: works without JS via the «اعمال» button; with JS the select applies on change
 * and the button is hidden.
 */
export function SortSelect({ action, value, hidden }: SortSelectProps) {
  const router = useRouter();
  const id = useId();
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

  return (
    <form
      action={action}
      method="get"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const sp = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget)) {
          if (k === "ordering" && v === DEFAULT_ORDERING) continue;
          sp.set(k, String(v));
        }
        const qs = sp.toString();
        router.push(qs ? `${action}?${qs}` : action, { scroll: false });
      }}
    >
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="sr-only shrink-0 text-sm text-ink-muted sm:not-sr-only">
        مرتب‌سازی
      </label>
      <select
        id={id}
        name="ordering"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 min-w-0 rounded-control border border-line-strong bg-surface pe-8 ps-3 text-sm font-bold text-ink focus:border-primary"
      >
        {ORDERINGS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={
          enhanced
            ? "sr-only"
            : "min-h-11 rounded-control border border-primary px-3 text-sm font-bold text-primary hover:bg-primary-soft"
        }
        tabIndex={enhanced ? -1 : undefined}
      >
        اعمال
      </button>
    </form>
  );
}
