import { toPersianDigits } from "@/lib/format";
import { CheckIcon } from "@/components/ui/Icons";

export type StepId = "login" | "shipping" | "payment";
export type StepState = "done" | "current" | "upcoming" | "skipped";

export const STEP_LABEL: Record<StepId, string> = { login: "ورود", shipping: "ارسال", payment: "پرداخت" };
const ORDER: StepId[] = ["login", "shipping", "payment"];

/** «۱ ورود → ۲ ارسال → ۳ پرداخت»; the active step carries aria-current="step". */
export function Stepper({ states }: { states: Record<StepId, StepState> }) {
  return (
    <nav aria-label="مراحل خرید">
      <ol className="flex items-center gap-2">
        {ORDER.map((id, i) => {
          const state = states[id];
          const current = state === "current";
          const done = state === "done";
          const skipped = state === "skipped";
          return (
            <li key={id} aria-current={current ? "step" : undefined} className="flex flex-1 items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
                  current
                    ? "bg-primary text-white"
                    : done
                      ? "bg-success text-white"
                      : "border border-line-strong bg-surface text-ink-muted"
                }`}
              >
                {done ? <CheckIcon size={16} strokeWidth={3} /> : toPersianDigits(i + 1)}
              </span>
              <span className={`text-sm ${current ? "font-extrabold text-ink" : "font-medium text-ink-muted"}`}>
                {STEP_LABEL[id]}
                {skipped && <span className="block text-[0.6875rem] leading-4">لازم نیست</span>}
                <span className="sr-only">
                  {current ? " (مرحله فعلی)" : done ? " (انجام شد)" : skipped ? "" : " (مرحله بعد)"}
                </span>
              </span>
              {i < ORDER.length - 1 && <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-line-strong" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
