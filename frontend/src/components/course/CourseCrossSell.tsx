import type { BookDetail, CourseOffer } from "@/lib/types";
import { courseLength, courseLink, isEmptyOffer, orderTiers, recommendedRibbon, taughtByAuthor } from "@/lib/courses";
import { daysLeft } from "@/lib/exam-time";
import { formatJalaliDate, formatPercent, toPersianDigits, formatToman } from "@/lib/format";
import { IntroVideo } from "@/components/product/IntroVideo";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { ClockIcon, ExternalIcon, PlayIcon, TicketIcon } from "@/components/ui/Icons";
import { CourseCard } from "./CourseCard";
import { CourseFacts, CoursePrice, SellingPoints } from "./CourseParts";
import { CopyCodeButton } from "./CopyCodeButton";

interface CourseCrossSellProps {
  offer: CourseOffer | null;
  book: Pick<BookDetail, "slug" | "title" | "authors">;
  now: number;
  /** the study-plan lead magnet card (rendered next to the «more» list) */
  studyPlan?: React.ReactNode;
}

/**
 * «این درس را با دوره‌های دادرُز کامل کنید»: author/referenced course, good-better-best tiers, free first
 * session, the subject discount code and other courses. Server-rendered; every part hides when empty.
 */
export function CourseCrossSell({ offer, book, now, studyPlan }: CourseCrossSellProps) {
  if (!offer || isEmptyOffer(offer)) return null;
  const color = offer.subject?.color ?? "var(--color-primary)";
  const examDays = offer.exam_countdown ? (daysLeft(offer.exam_countdown.date, now) ?? offer.exam_countdown.days_left) : null;
  const tiers = orderTiers(offer.tiers, offer.recommended_type);
  const ribbon = recommendedRibbon(examDays);
  const discountDays = offer.discount ? (daysLeft(offer.discount.expires_on, now) ?? offer.discount.days_left) : null;
  const discount = offer.discount && (discountDays == null || discountDays >= 0) ? offer.discount : null;
  const code = discount ? { code: discount.code, percent: discount.percent } : null;
  const highlight = offer.highlight;
  const sample = offer.free_sample;
  const subjectName = offer.subject?.name;

  return (
    <section
      id="courses"
      aria-labelledby="courses-title"
      className="scroll-mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div aria-hidden="true" className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4 md:p-6">
        {/* heading */}
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold text-ink-muted">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
              آکادمی دادرُز{subjectName ? ` · ${subjectName}` : ""}
            </p>
            <h2 id="courses-title" className="mt-1.5 text-xl font-black leading-9 text-ink md:text-2xl">
              این درس را با دوره‌های دادرُز کامل کنید
            </h2>
            {offer.recommended_reason && (
              <p className="mt-1 text-sm leading-7 text-ink-muted">{offer.recommended_reason}</p>
            )}
          </div>
          {offer.exam_countdown && examDays != null && examDays > 0 && (
            <p className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary md:self-auto">
              <ClockIcon size={16} className="shrink-0" />
              {toPersianDigits(examDays)} روز تا {offer.exam_countdown.exam_name}
            </p>
          )}
        </header>

        {/* highlight + free sample */}
        {(highlight || sample) && (
          <div className={`mt-5 grid gap-4 ${highlight && sample ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
            {highlight && (
              <article
                className="flex flex-col rounded-card border border-line border-s-4 p-4 md:p-5"
                style={{
                  borderInlineStartColor: color,
                  backgroundColor: `color-mix(in srgb, ${color} 5%, #fff)`,
                }}
              >
                <ul className="flex flex-wrap gap-1.5">
                  {[
                    taughtByAuthor(highlight, book.authors) ? "تدریس توسط مؤلف همین کتاب" : null,
                    highlight.relevance_label ?? null,
                  ]
                    .filter((l, i, all): l is string => Boolean(l) && all.indexOf(l) === i)
                    .map((label) => (
                      <li key={label} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink">
                        {label}
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs font-bold text-primary">{highlight.course_type_label}</p>
                <h3 className="mt-0.5 text-lg font-black leading-8 text-ink md:text-xl">{highlight.title}</h3>
                {highlight.teachers.length > 0 && (
                  <p className="mt-0.5 text-sm text-ink">
                    مدرس: <strong>{highlight.teachers.join("، ")}</strong>
                    {taughtByAuthor(highlight, book.authors) && <span className="text-ink-muted"> — نویسنده «{book.title}»</span>}
                  </p>
                )}
                <CourseFacts course={highlight} className="mt-2" />
                <SellingPoints points={highlight.selling_points} className="mt-3" />
                <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <CoursePrice course={highlight} size="lg" />
                  <TrackedLink
                    href={courseLink(highlight.url, book.slug)}
                    external
                    event="course_cross_sell_click"
                    params={{ course: highlight.id, course_name: highlight.title, book: book.slug, tier: "highlight" }}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
                  >
                    مشاهده دوره در دادرُز
                    <ExternalIcon size={18} />
                    <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
                  </TrackedLink>
                </div>
              </article>
            )}
            {sample && (
              <article className="flex flex-col rounded-card border border-line bg-bg p-4 md:p-5">
                <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
                  <PlayIcon size={12} className="shrink-0" />
                  رایگان · بدون ثبت‌نام
                </p>
                <h3 className="mt-2 text-base font-extrabold leading-7 text-ink">جلسه اول را رایگان ببینید، بعد تصمیم بگیرید</h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {sample.course.title}
                  {sample.course.teachers.length > 0 ? ` · ${sample.course.teachers.join("، ")}` : ""}
                </p>
                <div className="mt-3">
                  <IntroVideo
                    url={sample.video_url}
                    title={sample.course.title}
                    label="پخش جلسه اول رایگان"
                    videoTitle={`جلسه اول رایگان ${sample.course.title}`}
                  />
                </div>
              </article>
            )}
          </div>
        )}

        {/* discount */}
        {discount && (
          <div className="mt-5 flex flex-col gap-4 rounded-card border border-accent bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-accent">
                {discount.percent ? <span className="text-sm font-black">{formatPercent(discount.percent)}</span> : <TicketIcon size={22} />}
              </span>
              <div className="min-w-0">
                <p className="font-extrabold leading-7 text-ink">{discount.label}</p>
                <p className="mt-0.5 text-sm leading-6 text-accent-ink">
                  معتبر تا {formatJalaliDate(discount.expires_on, "d MMMM")}
                  {discountDays != null && discountDays > 0 ? ` — ${toPersianDigits(discountDays)} روز دیگر` : " — امروز آخرین روز است"}
                  . هنگام خرید دوره در dadrose.com وارد کنید.
                </p>
              </div>
            </div>
            <div className="shrink-0 sm:w-56">
              <CopyCodeButton code={discount.code} />
            </div>
          </div>
        )}

        {/* good · better · best */}
        {tiers.length > 0 && (
          <div className="mt-6">
            <h3 className="text-base font-extrabold text-ink">
              کدام دوره برای شما؟ جامع، امهات یا نکته و تست
            </h3>
            <ul className="no-scrollbar -mx-4 mt-3 flex snap-x max-md:[contain:paint] snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 scroll-px-4 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
              {tiers.map((t) => (
                <li key={t.id} className="w-[80%] max-w-[19rem] shrink-0 snap-start md:w-auto md:max-w-none">
                  <CourseCard
                    course={t}
                    utmContent={book.slug}
                    book={book.slug}
                    tier={t.tier}
                    ribbon={t.is_recommended ? ribbon : null}
                    code={code}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* more + study plan */}
        {(offer.more.length > 0 || studyPlan) && (
          <div className={`mt-6 grid gap-5 ${offer.more.length > 0 && studyPlan ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
            {offer.more.length > 0 && (
              <div>
                <h3 className="text-base font-extrabold text-ink">دوره‌های دیگر این درس</h3>
                <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                  {offer.more.map((c) => {
                    const length = courseLength(c);
                    return (
                      <li key={c.id}>
                        <TrackedLink
                          href={courseLink(c.url, book.slug)}
                          external
                          event="course_cross_sell_click"
                          params={{ course: c.id, course_name: c.title, book: book.slug, tier: "more" }}
                          className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-primary-soft md:px-4"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold leading-6 text-ink">{c.title}</span>
                            <span className="block text-xs leading-5 text-ink-muted">
                              {[c.course_type_label, c.teachers.join("، "), length].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className={`shrink-0 text-sm font-extrabold ${c.is_free ? "text-success" : "text-ink"}`}>
                            {c.is_free ? "رایگان" : formatToman(c.effective_price)}
                          </span>
                          <ExternalIcon size={16} className="shrink-0 text-ink-muted" />
                          <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
                        </TrackedLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {studyPlan}
          </div>
        )}

        <p className="mt-5 text-xs leading-6 text-ink-muted">
          دوره‌ها در سایت آکادمی دادرُز (dadrose.com) ارائه و جداگانه خریداری می‌شوند؛ قیمت‌ها را پیش از خرید
          در همان سایت ببینید.
        </p>
      </div>
    </section>
  );
}
