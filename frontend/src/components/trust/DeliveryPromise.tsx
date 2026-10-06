"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { isShipped, promiseText } from "@/lib/delivery";
import type { DeliveryEstimate, ExamClash } from "@/lib/trust-types";
import type { VariantType } from "@/lib/types";
import { CalendarIcon, ClockIcon } from "@/components/ui/Icons";
import { useDeliverySummary } from "./useOwned";

/** «زمان کم است» box: the parcel may land within a week of the exam. */
export function ExamClashNote({
  clash,
  surface,
  action,
  className = "",
}: {
  clash: ExamClash;
  surface: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    track("delivery_exam_clash_shown", { surface, exam: clash.exam_name });
  }, [surface, clash.exam_name]);
  return (
    <div role="note" className={`rounded-control border border-warning bg-warning-soft px-3 py-2 text-sm leading-7 text-warning ${className}`}>
      <p className="flex items-start gap-1.5 font-bold">
        <ClockIcon size={18} className="mt-1 shrink-0" />
        <span>{clash.message}</span>
      </p>
      {action}
    </div>
  );
}

/** One line «تحویل تقریبی: …» for a known estimate (shipping step, order pages). */
export function PromiseLine({ estimate, className = "" }: { estimate: DeliveryEstimate | null | undefined; className?: string }) {
  const text = promiseText(estimate);
  if (!text) return null;
  return (
    <p className={`flex items-center gap-1.5 font-bold text-ink ${className}`}>
      <CalendarIcon size={16} className="shrink-0 text-primary" />
      {text}
    </p>
  );
}

/**
 * د۲ on the product page and the added-to-cart sheet: the nationwide delivery window for print
 * formats, plus the exam warning (with `clashAction`, e.g. «انتخاب نسخه الکترونیک»).
 */
export function DeliveryPromise({
  type,
  surface,
  clashAction,
  className = "",
}: {
  type: VariantType | undefined;
  surface: "product" | "sheet";
  clashAction?: React.ReactNode;
  className?: string;
}) {
  const shipped = isShipped(type);
  const summary = useDeliverySummary(shipped);
  if (!shipped || !summary?.estimate) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      <PromiseLine estimate={summary.estimate} className="text-[0.8125rem]" />
      {summary.exam_clash && <ExamClashNote clash={summary.exam_clash} surface={surface} action={clashAction} />}
    </div>
  );
}
