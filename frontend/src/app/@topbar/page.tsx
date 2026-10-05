import { getHome } from "@/lib/api";
import { selectedExamSlug } from "@/lib/exam-server";
import { formatJalaliDate } from "@/lib/format";
import { toCalendarEvent } from "@/lib/calendar";
import { CountdownBar } from "@/components/layout/CountdownBar";
import { HomeOnly } from "@/components/layout/HomeOnly";

export const dynamic = "force-dynamic";

/**
 * Homepage top bar: countdown to next_exam from the same (deduplicated) /catalog/home/ call —
 * for the visitor's selected exam when there is one (P1-3).
 */
export default async function TopbarHome() {
  let home;
  try {
    home = await getHome(await selectedExamSlug());
  } catch {
    return null;
  }
  const exam = home.next_exam;
  if (!exam) return null;
  return (
    <HomeOnly>
      <CountdownBar
        examName={exam.name}
        examDate={exam.date}
        examDateLabel={formatJalaliDate(exam.date)}
        serverNow={Date.now()}
        calendar={toCalendarEvent(exam)}
      />
    </HomeOnly>
  );
}
