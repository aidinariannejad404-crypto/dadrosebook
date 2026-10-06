import Link from "next/link";
import { serverApiGet } from "@/lib/server-session";
import { goalLine, streakLine, studyRoutes, type GoalState, type LivingPlan, type ReviewPromptItem } from "@/lib/study";
import { CalendarIcon, ChevronIcon } from "@/components/ui/Icons";
import { CelebrationBadge, GoalRing, StreakChip } from "./GoalRing";
import { ReviewPromptCard } from "./ReviewPromptCard";
import { TodayPlanCard } from "./TodayPlanCard";

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * Account dashboard block (ه۳، ه۵، ه۷): today's minutes vs goal with the streak, the plan's
 * «امروز» card (or an invitation to start one) and up to one review prompt. Renders nothing when
 * the study API is unavailable.
 */
export async function StudyDashboard({ readable }: { readable: string[] }) {
  const [goal, plan, prompts] = await Promise.all([
    safe(serverApiGet<GoalState>("/study/goal/")),
    safe(serverApiGet<LivingPlan>("/study/plan/?view=today")),
    safe(serverApiGet<ReviewPromptItem[]>("/study/review-prompts/")),
  ]);
  if (!goal) return null;
  const prompt = prompts?.[0] ?? null;

  return (
    <section aria-labelledby="study-today" className="space-y-3">
      <h2 id="study-today" className="text-lg font-extrabold text-ink">
        مطالعه امروز
      </h2>
      {goal.streak.milestone && <CelebrationBadge milestone={goal.streak.milestone} />}
      <Link
        href={studyRoutes.report}
        className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-card hover:shadow-raised"
      >
        <GoalRing minutes={goal.minutes} goal={goal.goal_minutes} />
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block font-bold text-ink">{goalLine(goal.minutes, goal.goal_minutes, goal.goal_met)}</span>
          <StreakChip days={goal.streak.current} met={goal.streak.today_met} />
          <span className="block text-xs leading-6 text-ink-muted">{streakLine(goal.streak)}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-primary sm:inline-flex">
          کارنامه
          <ChevronIcon size={18} />
        </span>
      </Link>
      {plan ? (
        <TodayPlanCard initial={plan} readable={readable} />
      ) : (
        <Link
          href={studyRoutes.plan}
          className="flex min-h-11 items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface p-4 text-sm hover:bg-primary-soft"
        >
          <CalendarIcon size={22} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-ink">برنامه مطالعه روزانه تا روز آزمون</span>
            <span className="block text-xs text-ink-muted">هر روز بدانید چه صفحه‌هایی را بخوانید؛ اگر عقب افتادید، با یک لمس فشرده می‌شود.</span>
          </span>
          <ChevronIcon size={18} className="shrink-0 text-primary" />
        </Link>
      )}
      {prompt && <ReviewPromptCard prompt={prompt} />}
    </section>
  );
}
