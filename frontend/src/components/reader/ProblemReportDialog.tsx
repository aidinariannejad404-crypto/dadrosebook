"use client";

import { useEffect, useId, useState } from "react";
import { trackReaderProblemReported } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import {
  PROBLEM_DESCRIPTION_MAX,
  PROBLEM_KINDS,
  SUPPORT_SLA_TEXT,
  deviceLabel,
  problemFormError,
  reportProblem,
} from "@/lib/reader-stream";
import type { ProblemKind } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { CheckIcon } from "@/components/ui/Icons";

export interface ProblemContext {
  page: number;
  /** "epub:<chapter>:<offset>" or "" (PDF) */
  location: string;
  chapterTitle?: string;
  ebookVersion?: number | null;
  format: string;
}

/**
 * ه۸ «گزارش مشکل» from the reader toolbar: type + description; the book, file version, page/location
 * and a device label are attached automatically (nothing else about the device).
 */
export function ProblemReportDialog({
  open,
  onClose,
  slug,
  context,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  context: ProblemContext;
}) {
  const [kind, setKind] = useState<ProblemKind | null>(null);
  const [description, setDescription] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const baseId = useId();

  useEffect(() => {
    if (open) {
      setKind(null);
      setDescription("");
      setState("idle");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    const problem = problemFormError(kind, description);
    if (problem) return setError(problem);
    setError("");
    setState("sending");
    const res = await reportProblem(slug, {
      kind: kind!,
      description: description.trim(),
      page: context.page || null,
      location: context.location,
      chapter_title: context.chapterTitle ?? "",
      ebook_version: context.ebookVersion ?? null,
      device_label: deviceLabel(typeof navigator === "undefined" ? "" : navigator.userAgent),
    });
    if (!res.ok) {
      setState("idle");
      return setError(
        res.error.kind === "throttled"
          ? "امروز چند گزارش فرستاده‌اید؛ لطفاً بعداً دوباره تلاش کنید."
          : res.error.kind === "auth"
            ? "برای ارسال گزارش وارد حساب خود شوید."
            : "ارسال گزارش انجام نشد. دوباره تلاش کنید.",
      );
    }
    setState("sent");
    trackReaderProblemReported({ book: slug, kind: kind!, format: context.format });
  };

  const where = [
    context.chapterTitle ? `فصل «${context.chapterTitle}»` : null,
    context.page ? `صفحه ${formatNumber(context.page)}` : null,
  ]
    .filter(Boolean)
    .join("، ");

  return (
    <Dialog open={open} onClose={onClose} title="گزارش مشکل این کتاب" placement="sheet">
      {state === "sent" ? (
        <div className="space-y-4 text-center" role="status">
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
            <CheckIcon size={28} strokeWidth={2.4} />
          </span>
          <p className="font-bold leading-8">گزارش شما رسید؛ ممنون که کمک می‌کنید کتاب بهتر شود.</p>
          <p className="text-sm leading-7 text-ink-muted">{SUPPORT_SLA_TEXT}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface hover:bg-primary-hover"
          >
            بازگشت به کتاب
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {where && (
            <p className="rounded-control bg-surface-muted px-3 py-2 text-sm leading-7 text-ink-muted">
              محل مشکل: <span className="font-bold text-ink">{where}</span>
            </p>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-bold">نوع مشکل</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROBLEM_KINDS.map((k) => {
                const id = `${baseId}-${k.value}`;
                return (
                  <label
                    key={k.value}
                    htmlFor={id}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm ${
                      kind === k.value ? "border-primary bg-primary-soft font-bold" : "border-line hover:bg-primary-soft"
                    }`}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={`${baseId}-kind`}
                      value={k.value}
                      checked={kind === k.value}
                      onChange={() => setKind(k.value)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {k.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${baseId}-desc`} className="mb-1.5 block text-sm font-bold">
              توضیح {kind === "other" ? "" : <span className="font-normal text-ink-muted">(اختیاری)</span>}
            </label>
            <textarea
              id={`${baseId}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={PROBLEM_DESCRIPTION_MAX}
              rows={4}
              placeholder="مثلاً: در ماده ۱۹۰ یک کلمه جا افتاده است."
              className="w-full rounded-control border border-line bg-bg p-3 text-base leading-7 text-ink placeholder:text-ink-muted focus:border-primary focus:bg-surface"
            />
          </div>
          <p className="text-xs leading-6 text-ink-muted">
            نام کتاب، نسخه فایل، محل فعلی شما در کتاب و نوع دستگاه همراه گزارش فرستاده می‌شود. {SUPPORT_SLA_TEXT}
          </p>
          <p role="alert" className="min-h-6 text-sm font-bold text-danger">
            {error}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-control px-5 font-bold text-primary hover:bg-primary-soft"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={state === "sending"}
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface hover:bg-primary-hover disabled:opacity-60"
            >
              {state === "sending" ? "در حال ارسال…" : "ارسال گزارش"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
