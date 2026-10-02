import { getHome } from "@/lib/api";
import { routes } from "@/lib/config";
import { Hero } from "@/components/home/Hero";
import { ExamChips } from "@/components/home/ExamChips";
import { SubjectTiles } from "@/components/home/SubjectTiles";
import { CourseBanner } from "@/components/home/CourseBanner";
import { GuideVideos } from "@/components/home/GuideVideos";
import { TrustRow } from "@/components/home/TrustRow";
import { BookRail } from "@/components/book/BookRail";
import { SectionHeader } from "@/components/ui/SectionHeader";

// SSR on each request; the API response itself is cached for 60s (fetch revalidate) and does not
// need the backend at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const home = await getHome();

  return (
    <div className="mx-auto flex max-w-site flex-col gap-10 px-4 pt-4 md:gap-14 md:pt-6">
      <Hero banner={home.hero_banners[0]} books={home.bestsellers} />

      <ExamChips examTypes={home.exam_types} />

      <SubjectTiles subjects={home.subjects} />

      {home.bestsellers.length > 0 && (
        <section aria-labelledby="bestsellers-title">
          <SectionHeader
            id="bestsellers-title"
            title="پرفروش‌ترین‌ها"
            subtitle="انتخاب داوطلبان آزمون‌های اخیر"
            href={routes.search({ ordering: "-sales_count" })}
          />
          <BookRail books={home.bestsellers} labelledBy="bestsellers-title" />
        </section>
      )}

      {home.quick_review.length > 0 && (
        <section aria-labelledby="quick-title">
          <SectionHeader
            id="quick-title"
            title="سریع‌خوان‌ها"
            subtitle="جمع‌بندی ماه آخر؛ نکته‌های پرتکرار در کمترین زمان"
            href={routes.search({ quick_review: "true" })}
          />
          <BookRail books={home.quick_review} labelledBy="quick-title" showNotify />
        </section>
      )}

      <CourseBanner banner={home.course_banners[0]} course={home.featured_course} />

      <GuideVideos videos={home.guide_videos} />

      <TrustRow />
    </div>
  );
}
