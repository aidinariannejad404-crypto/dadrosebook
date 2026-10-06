import type { Course } from "@/lib/types";
import { courseLink, priceWithCode } from "@/lib/courses";
import { formatToman } from "@/lib/format";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { ExternalIcon, StarIcon } from "@/components/ui/Icons";
import { CourseFacts, CoursePrice, SellingPoints } from "./CourseParts";

interface CourseCardProps {
  course: Course;
  /** utm_content: the book slug (or the placement, e.g. "study-plan") */
  utmContent: string;
  /** analytics: the book slug or null */
  book: string | null;
  /** analytics tier: best/better/good, or the placement */
  tier: string;
  /** highlighted card with a ribbon («پیشنهاد ما برای ۳۳ روز مانده») */
  ribbon?: string | null;
  /** discount percent of the subject code, for the «با کد …» line */
  code?: { code: string; percent: number | null } | null;
  className?: string;
}

/** One course: type, title, teachers, length, price and a single CTA to dadrose.com. */
export function CourseCard({ course, utmContent, book, tier, ribbon, code, className = "" }: CourseCardProps) {
  const recommended = Boolean(ribbon);
  const withCode = code ? priceWithCode(course.effective_price, code.percent) : null;
  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-card bg-surface ${
        recommended ? "border-2 border-primary shadow-raised" : "border border-line shadow-card"
      } ${className}`}
    >
      {recommended && (
        <p className="flex items-center justify-center gap-1.5 bg-primary px-3 py-1.5 text-center text-xs font-bold text-white">
          <StarIcon size={14} className="shrink-0 text-accent" />
          {ribbon}
        </p>
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-bold text-primary">{course.course_type_label}</p>
        <h3 className="mt-1 text-base font-extrabold leading-7 text-ink">{course.title}</h3>
        {course.teachers.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-muted">
            <span className="sr-only">مدرس: </span>
            {course.teachers.join("، ")}
          </p>
        )}
        <CourseFacts course={course} className="mt-2" />
        <div className="mt-3 border-t border-line pt-3">
          <CoursePrice course={course} />
          {withCode != null && code && (
            <p className="mt-1 text-xs font-bold text-success">
              با کد <bdi dir="ltr" className="font-mono tracking-wide">{code.code}</bdi>: {formatToman(withCode)}
            </p>
          )}
        </div>
        <SellingPoints points={course.selling_points} className="mt-3" />
        <div className="mt-auto pt-4">
        <TrackedLink
          href={courseLink(course.url, utmContent)}
          external
          course={{ course_id: course.id, course_title: course.title, book_slug: book, placement: tier }}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold transition-colors ${
            recommended
              ? "bg-primary text-white hover:bg-primary-hover"
              : "border-2 border-primary text-primary hover:bg-primary-soft"
          }`}
        >
          {course.is_free ? "ثبت‌نام رایگان در دادرُز" : "مشاهده دوره در دادرُز"}
          <ExternalIcon size={16} />
          <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
        </TrackedLink>
        </div>
      </div>
    </article>
  );
}
