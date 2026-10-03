import type { Metadata } from "next";
import { fixturesEnabled, getHome } from "@/lib/api";
import { routes, siteUrl } from "@/lib/config";
import { organizationJsonLd, serializeJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { DEFAULT_OPEN_GRAPH } from "@/lib/seo";
import { selectedExamSlug } from "@/lib/exam-server";
import { daysLeft, quickReviewFirst } from "@/lib/exam-time";
import { toPersianDigits } from "@/lib/format";
import { Hero } from "@/components/home/Hero";
import { ExamChips } from "@/components/home/ExamChips";
import { SubjectTiles } from "@/components/home/SubjectTiles";
import { CourseBanner } from "@/components/home/CourseBanner";
import { GuideVideos } from "@/components/home/GuideVideos";
import { TrustRow } from "@/components/home/TrustRow";
import { BookRail } from "@/components/book/BookRail";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StudyPlanCta } from "@/components/plan/StudyPlanCta";

// SSR on each request (the «آزمون من» cookie picks the variant); the API response itself is cached
// per URL — so per exam type — for 60s (fetch revalidate) and does not need the backend at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...DEFAULT_OPEN_GRAPH, url: "/" },
};

export default async function HomePage() {
  const exam = await selectedExamSlug();
  const home = await getHome(exam);
  const selected = home.selected_exam_type;
  const now = Date.now();

  // P1-9: in the last 45 days the quick-review rail moves above the bestsellers.
  const quickFirst = quickReviewFirst(home.next_exam?.date, now);
  const days = daysLeft(home.next_exam?.date, now);
  const quickSearch = routes.search({ quick_review: "true", ...(selected ? { exam_type: selected.slug } : {}) });

  const bestsellers = home.bestsellers.length > 0 && (
    <section key="bestsellers" aria-labelledby="bestsellers-title">
      <SectionHeader
        id="bestsellers-title"
        title="پرفروش‌ترین‌ها"
        subtitle={selected ? `انتخاب داوطلبان ${selected.name}` : "انتخاب داوطلبان آزمون‌های اخیر"}
        href={routes.search({ ordering: "-sales_count", ...(selected ? { exam_type: selected.slug } : {}) })}
      />
      <BookRail books={home.bestsellers} labelledBy="bestsellers-title" />
    </section>
  );

  const quickReview = home.quick_review.length > 0 && (
    <section key="quick" aria-labelledby="quick-title">
      <SectionHeader
        id="quick-title"
        title={quickFirst && days != null ? `جمع‌بندی ${toPersianDigits(days)} روز آخر` : "سریع‌خوان‌ها"}
        subtitle={
          quickFirst
            ? "سریع‌خوان‌ها: نکته‌های پرتکرار هر درس در کمترین زمان"
            : "جمع‌بندی ماه آخر؛ نکته‌های پرتکرار در کمترین زمان"
        }
        href={quickSearch}
      />
      <BookRail books={home.quick_review} labelledBy="quick-title" showNotify />
    </section>
  );

  const site = siteUrl();
  const jsonLd = [organizationJsonLd(site, home.store), websiteJsonLd(site)];

  return (
    <div className="mx-auto flex max-w-site flex-col gap-10 px-4 pt-4 md:gap-14 md:pt-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <Hero banner={home.hero_banners[0]} books={home.bestsellers} store={home.store} examName={selected?.name} />

      <ExamChips examTypes={home.exam_types} selected={selected} />

      <SubjectTiles subjects={home.subjects} examName={selected?.name} />

      <StudyPlanCta
        layout="banner"
        examTypes={home.exam_types}
        subjects={home.subjects}
        defaultExam={selected?.slug ?? exam ?? home.next_exam?.exam_type.slug ?? null}
        defaultSubjects={[]}
        book={null}
        fixtures={fixturesEnabled()}
        examLine={days != null && days > 0 && home.next_exam ? `${toPersianDigits(days)} روز تا ${home.next_exam.name}` : null}
      />

      {quickFirst ? [quickReview, bestsellers] : [bestsellers, quickReview]}

      <CourseBanner banner={home.course_banners[0]} course={home.featured_course} />

      <GuideVideos videos={home.guide_videos} />

      <TrustRow store={home.store} />
    </div>
  );
}
