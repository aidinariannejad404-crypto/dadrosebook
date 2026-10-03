"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Me } from "@/lib/account-types";
import type { ExamTypeMini } from "@/lib/types";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/session";
import { accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { RATING_LABELS, REVIEW_BODY_MAX } from "@/lib/reviews";
import { toPersianDigits } from "@/lib/format";
import { StarIcon } from "@/components/ui/Icons";

type Phase = "closed" | "checking" | "anonymous" | "open" | "sent";

/**
 * «نظر خود را بنویسید»: checks the session only when opened (no request on page view).
 * Guests get a login link that returns to #reviews; members get a star radio group, text and exam type.
 */
export function ReviewForm({ slug, examTypes }: { slug: string; examTypes: ExamTypeMini[] }) {
  const id = useId();
  const [phase, setPhase] = useState<Phase>("closed");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [exam, setExam] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loginHref = accountRoutes.login(`${routes.product(slug)}#reviews`);
  const endpoint = `/catalog/books/${encodeURIComponent(slug)}/reviews/`;

  async function open() {
    setPhase("checking");
    const me = await apiFetch<Me>("/me/");
    setPhase(me.ok ? "open" : me.status === 401 || me.status === 403 ? "anonymous" : "open");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setErrors({ rating: "لطفاً امتیاز خود را انتخاب کنید." });
      setMessage("");
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage("");
    const res = await apiFetch<{ status: string; message: string }>(endpoint, {
      method: "POST",
      json: { rating, body: body.trim(), exam_type: exam || null },
    });
    setBusy(false);
    if (res.ok) {
      setMessage(res.data?.message || "نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود.");
      setPhase("sent");
      return;
    }
    if (res.status === 401) {
      setPhase("anonymous");
      return;
    }
    setErrors(fieldErrors(res.error));
    setMessage(errorMessage(res.error));
  }

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {phase === "checking" ? "در حال بررسی ورود…" : phase === "anonymous" ? "برای ثبت نظر وارد شوید." : ""}
    </p>
  );

  if (phase === "closed" || phase === "checking") {
    return (
      <div>
        <button
          type="button"
          onClick={open}
          disabled={phase === "checking"}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary bg-surface px-4 font-bold text-primary hover:bg-primary-soft disabled:opacity-60"
        >
          <StarIcon size={18} />
          {phase === "checking" ? "لحظه‌ای صبر کنید…" : "نظر خود را بنویسید"}
        </button>
        {live}
      </div>
    );
  }

  if (phase === "anonymous") {
    return (
      <div className="rounded-card border border-line bg-surface p-4 text-sm leading-7">
        {live}
        <p className="text-ink">برای ثبت نظر ابتدا وارد حساب کاربری خود شوید.</p>
        <Link
          href={loginHref}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 font-bold text-white hover:bg-primary-hover"
        >
          ورود و ثبت نظر
        </Link>
      </div>
    );
  }

  if (phase === "sent") {
    return (
      <div role="status" aria-live="polite" className="rounded-card bg-success-soft p-4 text-sm font-bold leading-7 text-success">
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-card border border-line bg-surface p-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-extrabold text-ink">
        نظر شما درباره این کتاب
      </h3>

      <fieldset className="mt-3" aria-describedby={errors.rating ? `${id}-rating-err` : undefined}>
        <legend className="text-sm font-bold text-ink">امتیاز شما</legend>
        <div className="mt-1 flex items-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="relative">
              <input
                type="radio"
                id={`${id}-r${n}`}
                name={`${id}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <label
                htmlFor={`${id}-r${n}`}
                className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-control peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-focus"
              >
                <StarIcon size={30} className={n <= rating ? "text-accent-strong" : "text-line-strong"} />
                <span className="sr-only">
                  {toPersianDigits(n)} ستاره، {RATING_LABELS[n]}
                </span>
              </label>
            </span>
          ))}
          <span className="ms-2 text-sm font-bold text-ink-muted" aria-hidden="true">
            {rating > 0 ? RATING_LABELS[rating] : ""}
          </span>
        </div>
        {errors.rating && (
          <p id={`${id}-rating-err`} role="alert" className="mt-1 text-xs font-bold text-danger">
            {errors.rating}
          </p>
        )}
      </fieldset>

      <div className="mt-3">
        <label htmlFor={`${id}-body`} className="text-sm font-bold text-ink">
          متن نظر
        </label>
        <textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
          rows={5}
          maxLength={REVIEW_BODY_MAX}
          placeholder="این کتاب برای آمادگی آزمون چقدر به شما کمک کرد؟"
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={`${id}-body-count${errors.body ? ` ${id}-body-err` : ""}`}
          className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base leading-7 text-ink aria-[invalid=true]:border-danger"
        />
        <p id={`${id}-body-count`} className="mt-1 text-xs text-ink-muted">
          {toPersianDigits(body.length)} از {toPersianDigits(REVIEW_BODY_MAX)} نویسه
        </p>
        {errors.body && (
          <p id={`${id}-body-err`} className="mt-1 text-xs font-bold text-danger">
            {errors.body}
          </p>
        )}
      </div>

      {examTypes.length > 0 && (
        <div className="mt-3">
          <label htmlFor={`${id}-exam`} className="text-sm font-bold text-ink">
            برای کدام آزمون خواندید؟ (اختیاری)
          </label>
          <select
            id={`${id}-exam`}
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            aria-invalid={errors.exam_type ? true : undefined}
            className="mt-1 block min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
          >
            <option value="">انتخاب نشده</option>
            {examTypes.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
          {errors.exam_type && <p className="mt-1 text-xs font-bold text-danger">{errors.exam_type}</p>}
        </div>
      )}

      <p role="alert" className="mt-3 text-sm font-bold text-danger empty:hidden">
        {message}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "در حال ثبت…" : "ثبت نظر"}
      </button>
      <p className="mt-2 text-xs leading-6 text-ink-muted">نظرها پس از بررسی نمایش داده می‌شوند.</p>
    </form>
  );
}
