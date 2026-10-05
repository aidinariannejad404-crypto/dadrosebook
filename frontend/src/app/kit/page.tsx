import type { Metadata } from "next";
import { getExamEvents, getExamTypes, getStudyKits } from "@/lib/api";
import { parseExamSlug } from "@/lib/exam-cookie";
import { selectedExamSlug } from "@/lib/exam-server";
import { formatJalaliDate } from "@/lib/format";
import { examCountdown } from "@/lib/countdown";
import { orderKits } from "@/lib/kit";
import type { ExamEvent, ExamTypeMini, StudyKit } from "@/lib/types";
import { toCalendarEvent } from "@/lib/calendar";
import { KitBuilder } from "@/components/kit/KitBuilder";

export const metadata: Metadata = {
  title: "ساخت کیت مطالعاتی آزمون",
  description:
    "منابع ضروری و پیشنهادی هر درس آزمون وکالت، قضاوت و سردفتری را بر اساس ضریب دروس انتخاب کنید و همه را یک‌جا به سبد خرید اضافه کنید.",
  alternates: { canonical: "/kit" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/** Study-kit builder: exam (?exam= or the «آزمون من» cookie) → subjects by weight → books and formats → bulk add. */
export default async function KitPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const examTypes = await safe<ExamTypeMini[]>(getExamTypes(), []);
  const known = (slug: string | null) => (slug && examTypes.some((e) => e.slug === slug) ? slug : null);
  const exam = known(parseExamSlug(first(sp.exam))) ?? known(await selectedExamSlug()) ?? examTypes[0]?.slug ?? null;

  const [kits, events] = await Promise.all([
    exam ? safe<StudyKit[]>(getStudyKits(exam), []) : Promise.resolve([]),
    safe<ExamEvent[]>(getExamEvents(), []),
  ]);
  const now = Date.now();
  const next = events
    .filter((e) => e.exam_type.slug === exam && !examCountdown(e.date, now).past)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="mx-auto max-w-site px-4 py-5 md:py-8">
      <KitBuilder
        key={exam ?? "none"}
        examTypes={examTypes}
        exam={exam}
        kits={orderKits(kits.filter((k) => k.items.length > 0))}
        subjectsParam={first(sp.s) ?? null}
        event={
          next
            ? { name: next.name, date: next.date, dateLabel: formatJalaliDate(next.date), calendar: toCalendarEvent(next) }
            : null
        }
        serverNow={now}
      />
    </div>
  );
}
