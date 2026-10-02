import type { ExamTypeMini } from "@/lib/types";
import { CheckIcon } from "@/components/ui/Icons";

/**
 * «مناسب برای» (P1-2): every active exam type with ✓ / –. Falls back to the book's own exam types
 * when the exam-type list is unavailable.
 */
export function ExamFit({ all, fits, className = "" }: { all: ExamTypeMini[]; fits: ExamTypeMini[]; className?: string }) {
  const list = all.length > 0 ? all : fits;
  if (list.length === 0 || fits.length === 0) return null;
  const fitIds = new Set(fits.map((e) => e.id));
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm ${className}`}>
      <p id="exam-fit-title" className="font-bold text-ink">
        مناسب برای:
      </p>
      <ul aria-labelledby="exam-fit-title" className="flex flex-wrap gap-1.5">
        {list.map((e) => {
          const ok = fitIds.has(e.id);
          return (
            <li
              key={e.id}
              title={e.name}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                ok ? "bg-success-soft text-success" : "bg-neutral-soft text-ink-muted"
              }`}
            >
              {e.short_name || e.name}
              {ok ? (
                <CheckIcon size={13} strokeWidth={3} />
              ) : (
                <span aria-hidden="true">–</span>
              )}
              <span className="sr-only">{ok ? ": مناسب" : ": نامناسب"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
