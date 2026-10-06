import { formatPercent, toPersianDigits } from "@/lib/format";
import { goalPercent, milestoneText } from "@/lib/study";

/** Circular progress toward today's goal (SVG; no animation needed). */
export function GoalRing({
  minutes,
  goal,
  size = 72,
  label = "پیشرفت هدف امروز",
}: {
  minutes: number;
  goal: number;
  size?: number;
  label?: string;
}) {
  const pct = goalPercent(minutes, goal);
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${toPersianDigits(minutes)} از ${toPersianDigits(goal)} دقیقه، ${formatPercent(pct)}`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-primary-tint)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={pct >= 100 ? "var(--color-success)" : "var(--color-accent)"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="relative text-center leading-tight" aria-hidden="true">
        <span className="block text-base font-black text-ink tabular-nums">{toPersianDigits(minutes)}</span>
        <span className="block text-[0.65rem] text-ink-muted">از {toPersianDigits(goal)}</span>
      </span>
    </div>
  );
}

/** Flame-free streak chip: «۷ روز پیاپی». */
export function StreakChip({ days, met }: { days: number; met: boolean }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${
        met ? "bg-success-soft text-success" : "bg-primary-soft text-primary"
      }`}
    >
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-current" />
      {days > 0 ? `${toPersianDigits(days)} روز پیاپی` : "شروع زنجیره"}
    </span>
  );
}

/** The 7/30-day (or goal) celebration: CSS-only burst, still under reduced motion. */
export function CelebrationBadge({ milestone, compact = false }: { milestone: 7 | 30 | null; compact?: boolean }) {
  const title = milestone ? `${toPersianDigits(milestone)} روز پیاپی!` : "هدف امروز انجام شد";
  const text = milestone ? milestoneText(milestone) : "آفرین؛ امروز هم یک قدم به روز آزمون نزدیک‌تر شدید.";
  return (
    <div className={`study-pop flex items-center gap-3 ${compact ? "" : "rounded-card bg-accent-soft p-4"}`}>
      <span className="study-burst inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-black text-[color:var(--color-on-accent)]">
        <span aria-hidden="true">{milestone ? toPersianDigits(milestone) : "✓"}</span>
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} aria-hidden="true" />
        ))}
      </span>
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{title}</p>
        <p className="text-sm leading-6 text-ink">{text}</p>
      </div>
    </div>
  );
}
