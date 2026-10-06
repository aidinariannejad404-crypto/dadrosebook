import type { Order } from "@/lib/account-types";
import { formatJalaliDateTime, timelineSteps } from "@/lib/order-status";
import { CheckIcon, CloseIcon } from "@/components/ui/Icons";

/** Vertical stepper: logged status changes with Jalali date-times, then the remaining steps. */
export function OrderTimeline({ order }: { order: Pick<Order, "timeline" | "status" | "needs_shipping"> }) {
  const rows = timelineSteps(order.timeline, order.status, order.needs_shipping);
  return (
    <ol className="relative">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const dot =
          row.state === "failed"
            ? "bg-danger text-white"
            : row.state === "upcoming"
              ? "border-2 border-line-strong bg-surface"
              : row.state === "current"
                ? "bg-primary text-white ring-4 ring-primary-tint"
                : "bg-success text-white";
        return (
          <li key={`${row.status}-${i}`} className="relative flex gap-3 pb-5 last:pb-0" aria-current={row.state === "current" ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute start-[0.6875rem] top-6 h-[calc(100%-1.5rem)] w-0.5 ${
                  row.state === "upcoming" || rows[i + 1]?.state === "upcoming" ? "bg-line" : "bg-success"
                }`}
              />
            )}
            <span className={`relative z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dot}`}>
              {row.state === "failed" ? (
                <CloseIcon size={14} strokeWidth={2.6} />
              ) : row.state === "done" ? (
                <CheckIcon size={14} strokeWidth={2.8} />
              ) : null}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${row.state === "upcoming" ? "text-ink-muted" : "text-ink"}`}>
                {row.label}
                {row.state === "upcoming" && <span className="sr-only"> (مرحله بعدی)</span>}
              </p>
              {row.at && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  <time dateTime={row.at}>{formatJalaliDateTime(row.at)}</time>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
