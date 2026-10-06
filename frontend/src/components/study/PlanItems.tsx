"use client";

import Link from "next/link";
import { accountRoutes } from "@/lib/account-routes";
import { pagesLabel, planItemKey, type LivingPlanItem } from "@/lib/study";
import { CheckIcon } from "@/components/ui/Icons";

/**
 * Check-off list of plan items. Each row is a real checkbox (44px target); ebook items link to
 * the reader. `onToggle` resolves when the server has answered.
 */
export function PlanItems({
  items,
  busyKey,
  onToggle,
  readable,
  disabled = false,
}: {
  items: LivingPlanItem[];
  busyKey: string | null;
  onToggle: (item: LivingPlanItem, done: boolean) => void;
  /** slugs that open in the ebook reader */
  readable: Set<string>;
  disabled?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const key = planItemKey(item);
        const busy = busyKey === key;
        return (
          <li
            key={key}
            className={`flex items-start gap-3 rounded-control border px-3 py-2 ${
              item.done ? "border-success-soft bg-success-soft" : "border-line bg-surface"
            }`}
          >
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3">
              <span className="relative mt-2.5 inline-flex size-6 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy || disabled}
                  onChange={(e) => onToggle(item, e.target.checked)}
                  className="peer absolute inset-0 size-6 cursor-pointer appearance-none rounded-md border-2 border-line-strong bg-surface checked:border-success checked:bg-success"
                />
                <CheckIcon size={16} strokeWidth={3} className="pointer-events-none relative hidden text-white peer-checked:block" />
              </span>
              <span className="min-w-0 py-1.5 text-sm leading-6">
                <span className={`font-bold ${item.done ? "text-success" : "text-ink"}`}>
                  {item.task} «{item.book_title}»
                </span>
                <span className="block text-xs text-ink-muted">
                  {pagesLabel(item.pages_from, item.pages_to)}
                  {item.subject ? ` · ${item.subject.name}` : ""}
                  {item.rescheduled ? " · به روزهای بعد منتقل شد" : ""}
                </span>
              </span>
            </label>
            {readable.has(item.book_slug) && !item.done && (
              <Link
                href={accountRoutes.read(item.book_slug)}
                className="mt-1 inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-xs font-bold text-primary hover:bg-primary-soft"
              >
                بخوانید
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
