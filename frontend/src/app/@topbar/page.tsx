import { getHome } from "@/lib/api";
import { formatJalaliDate } from "@/lib/format";
import { CountdownBar } from "@/components/layout/CountdownBar";
import { HomeOnly } from "@/components/layout/HomeOnly";

export const dynamic = "force-dynamic";

/** Homepage top bar: countdown to next_exam from the same (deduplicated) /catalog/home/ call. */
export default async function TopbarHome() {
  let home;
  try {
    home = await getHome();
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
      />
    </HomeOnly>
  );
}
