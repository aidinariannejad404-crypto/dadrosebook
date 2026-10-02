import type { Course } from "@/lib/types";
import { formatNumber, formatToman, toPersianDigits } from "@/lib/format";
import { courseLength, hasCourseSale, pricePerHourLabel } from "@/lib/courses";
import { CheckIcon, ClockIcon, StarIcon, UsersIcon } from "@/components/ui/Icons";

/** Hours/sessions, students and rating — social proof only when the API provides it. */
export function CourseFacts({ course, className = "" }: { course: Course; className?: string }) {
  const length = courseLength(course);
  if (!length && course.students_count == null && course.rating == null) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted ${className}`}>
      {length && (
        <li className="inline-flex items-center gap-1">
          <ClockIcon size={15} className="shrink-0" />
          {length}
        </li>
      )}
      {course.students_count != null && (
        <li className="inline-flex items-center gap-1">
          <UsersIcon size={15} className="shrink-0" />
          {formatNumber(course.students_count)} دانشجو
        </li>
      )}
      {course.rating != null && (
        <li className="inline-flex items-center gap-1">
          <StarIcon size={15} className="shrink-0 text-accent-strong" />
          <span>
            {toPersianDigits(course.rating.toFixed(1).replace(".", "٫"))}
            <span className="sr-only"> از ۵</span> ({formatNumber(course.reviews_count)} نظر)
          </span>
        </li>
      )}
    </ul>
  );
}

/** Price (sale strike-through, «رایگان») + price per hour. */
export function CoursePrice({ course, size = "md" }: { course: Course; size?: "md" | "lg" }) {
  const perHour = pricePerHourLabel(course);
  const big = size === "lg" ? "text-2xl" : "text-xl";
  if (course.is_free) {
    return <p className={`${big} font-black text-success`}>رایگان</p>;
  }
  return (
    <div>
      {hasCourseSale(course) && (
        <del className="block text-sm text-ink-muted">
          <span className="sr-only">قیمت قبلی: </span>
          {formatToman(course.price)}
        </del>
      )}
      <p className={`${big} font-black leading-tight text-ink`}>
        {hasCourseSale(course) && <span className="sr-only">قیمت با تخفیف: </span>}
        {formatNumber(course.effective_price)} <span className="text-sm font-bold">تومان</span>
      </p>
      {perHour && <p className="mt-1 text-xs text-ink-muted">{perHour}</p>}
    </div>
  );
}

export function SellingPoints({ points, max = 3, className = "" }: { points: string[]; max?: number; className?: string }) {
  const shown = points.filter(Boolean).slice(0, max);
  if (shown.length === 0) return null;
  return (
    <ul className={`space-y-1.5 text-sm leading-6 text-ink ${className}`}>
      {shown.map((p) => (
        <li key={p} className="flex items-start gap-2">
          <CheckIcon size={16} strokeWidth={2.4} className="mt-1 shrink-0 text-success" />
          <span>{toPersianDigits(p)}</span>
        </li>
      ))}
    </ul>
  );
}
