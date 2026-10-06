"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { routes } from "@/lib/config";
import { trackReviewPromptRated } from "@/lib/analytics";
import { RATING_LABELS, REVIEW_BODY_MAX } from "@/lib/reviews";
import { apiFetch, errorMessage } from "@/lib/session";
import { toPersianDigits } from "@/lib/format";
import type { ReviewPromptItem } from "@/lib/study";
import { CloseIcon, StarIcon } from "@/components/ui/Icons";

type Step = "stars" | "text" | "done";

/**
 * ه۷: «این کتاب برای آزمون شما چقدر کمک کرد؟» — one tap on a star submits the rating (existing
 * reviews API); a short text is optional afterwards. Dismissable.
 */
export function ReviewPromptCard({ prompt }: { prompt: ReviewPromptItem }) {
  const [step, setStep] = useState<Step>("stars");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const textId = useId();
  const exam = prompt.exam_type?.name ?? "آزمون";
  const url = `/catalog/books/${encodeURIComponent(prompt.book.slug)}/reviews/`;

  async function send(r: number, text = "") {
    setBusy(true);
    setError("");
    const res = await apiFetch<{ message: string }>(url, {
      method: "POST",
      json: { rating: r, body: text, exam_type: prompt.exam_type?.slug ?? null },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.error, "rating", "ثبت نشد. دوباره تلاش کنید."));
      return false;
    }
    return true;
  }

  async function rate(r: number) {
    setRating(r);
    if (await send(r)) {
      trackReviewPromptRated({ rating: r, reason: prompt.reason });
      setStep("text");
    }
  }

  async function dismiss() {
    setHidden(true);
    await apiFetch<void>(`/study/review-prompts/${prompt.id}/dismiss/`, { method: "POST" });
  }

  if (hidden) return null;
  return (
    <section aria-label={`نظر درباره ${prompt.book.title}`} className="relative rounded-card border border-accent bg-accent-soft p-4">
      {step !== "done" && (
        <button
          type="button"
          onClick={() => void dismiss()}
          aria-label="بعداً"
          className="absolute end-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted hover:bg-white/60"
        >
          <CloseIcon size={18} />
        </button>
      )}
      <p className="pe-10 font-extrabold leading-7 text-ink">
        «
        <Link href={routes.product(prompt.book.slug)} className="hover:underline">
          {prompt.book.title}
        </Link>
        » برای {exam} شما چقدر کمک کرد؟
      </p>

      {step === "stars" && (
        <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="امتیاز با یک لمس">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => void rate(n)}
              aria-label={`${toPersianDigits(n)} ستاره: ${RATING_LABELS[n]}`}
              className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-white/60 disabled:opacity-60"
            >
              <StarIcon size={30} className={n <= rating ? "text-accent-strong" : "text-line-strong group-hover:text-accent-strong"} />
            </button>
          ))}
        </div>
      )}

      {step === "text" && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(rating, body).then((ok) => ok && setStep("done"));
          }}
        >
          <p className="text-sm text-ink">
            امتیاز {toPersianDigits(rating)} ثبت شد. اگر بخواهید، یک جمله هم برای داوطلبان بعدی بنویسید:
          </p>
          <label htmlFor={textId} className="sr-only">
            متن نظر (اختیاری)
          </label>
          <textarea
            id={textId}
            value={body}
            maxLength={REVIEW_BODY_MAX}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder="مثلاً: برای تست‌های آیین دادرسی کافی بود."
            className="w-full rounded-control border border-line bg-surface p-3 text-base text-ink focus:border-primary"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              ثبت متن
            </button>
            <button
              type="button"
              onClick={() => setStep("done")}
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-primary hover:bg-white/60"
            >
              کافی است
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <p role="status" className="mt-2 text-sm font-bold text-success">
          ممنون! نظر شما پس از بررسی برای داوطلبان دیگر نمایش داده می‌شود.
        </p>
      )}
      <p role="alert" className="mt-1 text-sm font-bold text-danger empty:hidden">
        {error}
      </p>
    </section>
  );
}
