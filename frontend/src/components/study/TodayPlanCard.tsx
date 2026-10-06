"use client";

import Link from "next/link";
import { studyRoutes, type LivingPlan } from "@/lib/study";
import { ChevronIcon } from "@/components/ui/Icons";
import { BehindBanner, TodaySection, usePlanActions } from "./LivingPlanView";

/** Account dashboard: the plan's «امروز» card with check-off and the behind-schedule action. */
export function TodayPlanCard({ initial, readable }: { initial: LivingPlan; readable: string[] }) {
  const { plan, busyKey, message, toggle, compress } = usePlanActions(initial, "today");
  return (
    <div className="space-y-3">
      <BehindBanner plan={plan} busy={busyKey === "compress"} onCompress={() => void compress()} />
      <TodaySection
        plan={plan}
        busyKey={busyKey}
        onToggle={(i, d) => void toggle(i, d)}
        readable={new Set(readable)}
        headingLevel={3}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm font-bold text-success empty:hidden">
          {message}
        </p>
        <Link
          href={studyRoutes.plan}
          className="ms-auto inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
        >
          همه برنامه
          <ChevronIcon size={18} />
        </Link>
      </div>
    </div>
  );
}
