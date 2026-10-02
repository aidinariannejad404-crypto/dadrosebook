import type { Banner, Course } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { withCourseUtm } from "@/lib/config";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { ExternalIcon, PlayIcon } from "@/components/ui/Icons";

/** Book + course cross-sell banner (external dadrose.com link with UTM). */
export function CourseBanner({ banner, course }: { banner: Banner | undefined; course: Course | null }) {
  if (!banner && !course) return null;
  return (
    <section aria-labelledby="course-banner-title" className="overflow-hidden rounded-card border border-accent bg-accent-soft">
      <div className="grid items-center gap-5 p-5 md:grid-cols-[1.3fr_1fr] md:p-8">
        <div>
          <p className="text-xs font-bold text-primary">کتاب + دوره ویدئویی</p>
          <h2 id="course-banner-title" className="mt-1 text-xl font-black leading-9 text-ink md:text-2xl">
            {banner?.title ?? "کتاب را بخوانید، دوره را ببینید"}
          </h2>
          {banner?.subtitle && <p className="mt-2 text-sm leading-7 text-ink-muted md:text-base md:leading-8">{banner.subtitle}</p>}
        </div>
        {course && (
          <div className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-accent">
                <PlayIcon size={22} />
              </span>
              <div className="min-w-0">
                <h3 className="font-extrabold leading-7 text-ink">{course.title}</h3>
                <p className="mt-1 text-sm font-bold text-ink">{formatToman(course.price)}</p>
              </div>
            </div>
            <TrackedLink
              href={withCourseUtm(course.url, "home_course")}
              external
              event="course_cross_sell_click"
              params={{ course_id: course.id, course_name: course.title, placement: "home" }}
              className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover"
            >
              مشاهده دوره در سایت دادرُز
              <ExternalIcon size={18} />
              <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
            </TrackedLink>
          </div>
        )}
      </div>
    </section>
  );
}
