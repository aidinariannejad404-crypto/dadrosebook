import type { ExamTypeMini } from "@/lib/types";
import { getBookReviews } from "@/lib/reviews-api";
import { distributionRows, formatAverage } from "@/lib/reviews";
import { formatPercent, toPersianDigits } from "@/lib/format";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Stars } from "./Stars";
import { ReviewForm } from "./ReviewForm";
import { ReviewList } from "./ReviewList";

interface ReviewsSectionProps {
  slug: string;
  examTypes: ExamTypeMini[];
}

/**
 * Product-page reviews (anchor #reviews): approved reviews rendered on the server, summary with
 * distribution bars, and the «نظر خود را بنویسید» form. Renders nothing when the API fails.
 */
export async function ReviewsSection({ slug, examTypes }: ReviewsSectionProps) {
  const data = await getBookReviews(slug);
  if (!data) return null;
  const { summary, results } = data;
  const rows = distributionRows(summary);

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-10 scroll-mt-24">
      <SectionHeader
        id="reviews-title"
        title="نظر خوانندگان"
        subtitle={summary.count > 0 ? `${toPersianDigits(summary.count)} نظر` : undefined}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8">
        <div className="flex flex-col gap-4">
          <div className="rounded-card bg-surface p-4 shadow-card">
            {summary.average != null ? (
              <div className="flex items-center gap-3">
                <p className="text-4xl font-black text-ink">{formatAverage(summary.average)}</p>
                <div>
                  <Stars value={summary.average} size={20} />
                  <p className="mt-1 text-xs text-ink-muted">از {toPersianDigits(summary.count)} نظر</p>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-7 text-ink-muted">
                {summary.count > 0
                  ? `${toPersianDigits(summary.count)} نظر ثبت شده؛ میانگین امتیاز از سومین نظر نمایش داده می‌شود.`
                  : "هنوز نظری برای این کتاب ثبت نشده است. اولین نفر باشید!"}
              </p>
            )}
            {summary.count > 0 && (
              <ul className="mt-4 space-y-1.5" aria-label="توزیع امتیازها">
                {rows.map((r) => (
                  <li key={r.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-ink">{toPersianDigits(r.stars)} ستاره</span>
                    <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-soft">
                      <span className="block h-full rounded-full bg-accent-strong" style={{ width: `${r.percent}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-end text-ink-muted">
                      {toPersianDigits(r.count)}
                      <span className="sr-only"> نظر، </span>
                      <span aria-hidden="true"> · </span>
                      {formatPercent(r.percent)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ReviewForm slug={slug} examTypes={examTypes} />
        </div>

        {results.length > 0 ? (
          /* retention stream (ه۷): filter by exam and by rating */
          <ReviewList slug={slug} initial={results} summary={summary} />
        ) : (
          <p className="rounded-card border border-dashed border-line-strong bg-surface p-6 text-center text-sm leading-7 text-ink-muted">
            تجربه خود از این کتاب را با داوطلبان دیگر به اشتراک بگذارید.
          </p>
        )}
      </div>
    </section>
  );
}
