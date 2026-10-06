"use client";

import { useState } from "react";
import type { Review, ReviewSummary } from "@/lib/account-types";
import { apiFetch } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import { ReviewItem } from "./ReviewItem";

/**
 * Retention stream (ه۷): approved reviews with filter chips — by exam («برای آزمون») and by star
 * rating (Baymard: users look for the negative ones). The first page is server rendered; a filter
 * refetches `GET /catalog/books/<slug>/reviews/?exam_type=&rating=`.
 */
export function ReviewList({ slug, initial, summary }: { slug: string; initial: Review[]; summary: ReviewSummary }) {
  const [items, setItems] = useState(initial);
  const [exam, setExam] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const exams = summary.exam_types ?? [];
  const ratings = ([5, 4, 3, 2, 1] as const).filter((r) => (summary.distribution?.[String(r) as "1"] ?? 0) > 0);

  async function apply(nextExam: string | null, nextRating: number | null) {
    setExam(nextExam);
    setRating(nextRating);
    if (!nextExam && !nextRating) return setItems(initial);
    setBusy(true);
    const qs = new URLSearchParams();
    if (nextExam) qs.set("exam_type", nextExam);
    if (nextRating) qs.set("rating", String(nextRating));
    const res = await apiFetch<{ results: Review[] }>(
      `/catalog/books/${encodeURIComponent(slug)}/reviews/?${qs.toString()}`,
      { retry: false },
    );
    setBusy(false);
    if (res.ok) setItems(res.data.results);
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-sm font-bold ${
      active ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink hover:bg-primary-soft"
    }`;
  const showFilters = exams.length > 0 || ratings.length > 1;

  return (
    <div>
      {showFilters && (
        <div className="mb-3 space-y-2" role="group" aria-label="فیلتر نظرها">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            <button type="button" aria-pressed={!exam && !rating} className={chip(!exam && !rating)} onClick={() => void apply(null, null)}>
              همه
            </button>
            {exams.map((e) => (
              <button
                key={e.slug}
                type="button"
                aria-pressed={exam === e.slug}
                className={chip(exam === e.slug)}
                onClick={() => void apply(exam === e.slug ? null : e.slug, rating)}
              >
                {e.short_name || e.name}
                <span className="text-xs opacity-80">({toPersianDigits(e.count)})</span>
              </button>
            ))}
            {ratings.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rating === r}
                className={chip(rating === r)}
                onClick={() => void apply(exam, rating === r ? null : r)}
              >
                {toPersianDigits(r)} ستاره
              </button>
            ))}
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "در حال بارگذاری نظرها" : `${toPersianDigits(items.length)} نظر`}
      </p>
      {items.length > 0 ? (
        <ul className={`space-y-3 ${busy ? "opacity-60" : ""}`}>
          {items.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-ink-muted">
          نظری با این فیلتر پیدا نشد.
        </p>
      )}
    </div>
  );
}
