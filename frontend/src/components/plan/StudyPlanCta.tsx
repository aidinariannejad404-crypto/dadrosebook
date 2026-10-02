import type { StudyPlanFormProps } from "./StudyPlanForm";
import { StudyPlanButton } from "./StudyPlanButton";
import { CalendarIcon, CheckIcon } from "@/components/ui/Icons";

interface StudyPlanCtaProps extends StudyPlanFormProps {
  /** «۳۳ روز تا آزمون کانون وکلا ۱۴۰۵» */
  examLine?: string | null;
  layout?: "card" | "banner";
}

const POINTS = ["صفحه‌به‌صفحه، بر اساس کتاب‌های خودتان", "روزهای جمع‌بندی پیش از آزمون", "قابل چاپ و ذخیره به‌صورت PDF"];

/** Lead magnet: «برنامه مطالعه شخصی تا روز آزمون — رایگان», unlocked by a mobile number. */
export function StudyPlanCta({ examLine, layout = "card", ...form }: StudyPlanCtaProps) {
  if (form.examTypes.length === 0) return null;
  const banner = layout === "banner";
  return (
    <aside
      aria-labelledby={`plan-cta-${banner ? "home" : "product"}`}
      className={`relative overflow-hidden rounded-card bg-primary text-white shadow-card ${
        banner ? "p-5 md:flex md:items-center md:justify-between md:gap-8 md:p-7" : "flex flex-col p-5"
      }`}
    >
      <span aria-hidden="true" className="absolute -end-10 -top-10 size-36 rounded-full border-[18px] border-white/[0.06]" />
      <div className="relative min-w-0">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-accent">
          <CalendarIcon size={14} className="shrink-0" />
          رایگان · با شماره موبایل
        </p>
        <h2
          id={`plan-cta-${banner ? "home" : "product"}`}
          className={`mt-3 font-black leading-9 ${banner ? "text-xl md:text-2xl" : "text-lg"}`}
        >
          برنامه مطالعه شخصی تا روز آزمون
        </h2>
        {examLine && <p className="mt-1 text-sm font-bold text-accent">{examLine}</p>}
        <ul className={`mt-3 space-y-1.5 text-sm leading-6 text-white/90 ${banner ? "md:flex md:gap-5 md:space-y-0" : ""}`}>
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <CheckIcon size={16} strokeWidth={2.4} className="mt-1 shrink-0 text-accent" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={`relative ${banner ? "mt-5 shrink-0 md:mt-0" : "mt-5"}`}>
        <StudyPlanButton
          {...form}
          label="دریافت برنامه رایگان"
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-accent px-6 font-extrabold text-ink transition-[filter] hover:brightness-95 ${banner ? "md:w-auto" : ""}`}
        />
      </div>
    </aside>
  );
}
