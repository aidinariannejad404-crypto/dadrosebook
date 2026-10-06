import type { Review } from "@/lib/account-types";
import { authorInitial, authorName } from "@/lib/reviews";
import { formatJalaliDay } from "@/lib/order-status";
import { toPersianDigits } from "@/lib/format";
import { CheckIcon } from "@/components/ui/Icons";
import { Stars } from "./Stars";

/** One approved review (server or client rendered). */
export function ReviewItem({ review }: { review: Review }) {
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
