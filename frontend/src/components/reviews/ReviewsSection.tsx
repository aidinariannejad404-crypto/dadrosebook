import type { Review } from "@/lib/account-types";
import type { ExamTypeMini } from "@/lib/types";
import { getBookReviews } from "@/lib/reviews-api";
import { authorInitial, authorName, distributionRows, formatAverage } from "@/lib/reviews";
import { formatJalaliDay } from "@/lib/order-status";
import { formatPercent, toPersianDigits } from "@/lib/format";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CheckIcon } from "@/components/ui/Icons";
import { Stars } from "./Stars";
import { ReviewForm } from "./ReviewForm";

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
          <ul className="space-y-3">
            {results.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </ul>
        ) : (
          <p className="rounded-card border border-dashed border-line-strong bg-surface p-6 text-center text-sm leading-7 text-ink-muted">
            تجربه خود از این کتاب را با داوطلبان دیگر به اشتراک بگذارید.
          </p>
        )}
      </div>
    </section>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const name = authorName(review.author);
  return (
    <li className="rounded-card bg-surface p-4 shadow-card">
      <article aria-label={`نظر ${name}`}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary"
          >
            {authorInitial(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{name}</p>
            <p className="text-xs text-ink-muted">
              <time dateTime={review.created_at}>{formatJalaliDay(review.created_at)}</time>
            </p>
          </div>
          <Stars value={review.rating} />
        </header>
        {(review.is_verified_purchase || review.exam_type) && (
          <p className="mt-3 flex flex-wrap gap-2 text-xs">
            {review.is_verified_purchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-bold text-success">
                <CheckIcon size={13} strokeWidth={2.6} />
                خریدار این کتاب
              </span>
            )}
            {review.exam_type && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 font-bold text-primary">
                <span className="sr-only">آزمون: </span>
                {review.exam_type.short_name || review.exam_type.name}
              </span>
            )}
          </p>
        )}
        {review.body && <p className="mt-3 whitespace-pre-line text-sm leading-8 text-ink">{toPersianDigits(review.body)}</p>}
      </article>
    </li>
  );
}
