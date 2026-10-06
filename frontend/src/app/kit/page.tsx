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
// growth (و۳): shared kit links
import { getSharedKit } from "@/lib/api";
import { kitShareImagePath, sharedKitParams } from "@/lib/growth";
import { DEFAULT_OPEN_GRAPH, NOINDEX_FOLLOW } from "@/lib/seo";
import { SharedKitView } from "@/components/growth/SharedKitView";

const KIT_DESCRIPTION =
  "منابع ضروری و پیشنهادی هر درس آزمون وکالت، قضاوت و سردفتری را بر اساس ضریب دروس انتخاب کنید و همه را یک‌جا به سبد خرید اضافه کنید.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The builder is canonical `/kit`; shared variants (`?k=` / `?b=`) are noindex with a cover-collage OG image. */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const shared = sharedKitParams(sp);
  if (!shared) {
    return { title: "ساخت کیت مطالعاتی آزمون", description: KIT_DESCRIPTION, alternates: { canonical: "/kit" } };
  }
  const exam = parseExamSlug(first(sp.exam));
  const title = "کیت مطالعاتی پیشنهادی دوستتان";
  const description = "فهرست کتاب‌هایی که برای آزمون فرستاده‌اند؛ با یک لمس همه را به سبد اضافه کنید.";
  return {
    title,
    description,
    robots: NOINDEX_FOLLOW,
    alternates: { canonical: "/kit" },
    openGraph: {
      ...DEFAULT_OPEN_GRAPH,
      title,
      description,
      images: [{ url: kitShareImagePath(shared, exam), width: 1200, height: 630, alt: "جلد کتاب‌های کیت" }],
    },
  };
}

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
  // growth (و۳): a shared kit replaces the builder (falls back to it when the link is unknown)
  const shared = sharedKitParams(sp);
  if (shared) {
    const kit = await safe(getSharedKit(shared, parseExamSlug(first(sp.exam))), null);
    if (kit && kit.items.length > 0) {
      return (
        <div className="mx-auto max-w-site px-4 py-5 md:py-8">
          <SharedKitView kit={kit} via={"k" in shared ? "token" : "slugs"} />
        </div>
      );
    }
  }
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
