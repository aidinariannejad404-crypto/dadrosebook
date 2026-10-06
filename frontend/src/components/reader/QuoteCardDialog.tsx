"use client";

import { useEffect, useRef, useState } from "react";
import { trackQuoteCardShared } from "@/lib/analytics";
import { routes, siteUrl } from "@/lib/config";
import { formatNumber } from "@/lib/format";
import { QUOTE_MAX, cardFileName, clampQuote, renderQuoteCard, shareOrDownload } from "@/lib/quote-card";
import { quotaRemaining } from "@/lib/reader-epub";
import type { CopyQuota, ReaderSession } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { ImageShareIcon } from "./ReaderIcons";

export const QUOTE_CARD_BRAND = "کتاب دادرُز";

type State =
  | { step: "confirm" }
  | { step: "working" }
  | { step: "ready"; blob: Blob; url: string; quote: string }
  | { step: "error"; message: string };

/**
 * و۲ «اشتراک به‌صورت تصویر»: the quote (≤ QUOTE_MAX chars) is spent from the copy quota through the
 * copies endpoint first, then drawn on a 1080×1350 canvas. Sharing is a second tap so the browser
 * still sees a user gesture for navigator.share.
 */
export function QuoteCardDialog({
  open,
  onClose,
  quote,
  book,
  quota,
  spend,
}: {
  open: boolean;
  onClose: () => void;
  quote: string;
  book: ReaderSession["book"];
  quota: CopyQuota | null;
  spend: (chars: number) => Promise<number | null>;
}) {
  const [state, setState] = useState<State>({ step: "confirm" });
  const urlRef = useRef<string | null>(null);
  const text = clampQuote(quote, QUOTE_MAX);
  const left = quotaRemaining(quota);
  const productUrl = `${siteUrl()}${routes.product(book.slug)}`;

  useEffect(() => {
    if (open) setState({ step: "confirm" });
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [open, quote]);

  const build = async () => {
    setState({ step: "working" });
    const granted = await spend(text.length);
    if (granted === null) return setState({ step: "error", message: "اتصال برقرار نشد. دوباره تلاش کنید." });
    if (granted <= 0) return setState({ step: "error", message: "سهمیه نقل‌قول این کتاب تمام شده است." });
    const finalQuote = granted < text.length ? clampQuote(text, granted) : text;
    try {
      const blob = await renderQuoteCard({
        quote: finalQuote,
        title: book.title,
        authors: book.authors,
        cover: book.cover,
        coverColor: book.subjects[0]?.color ?? null,
        siteUrl: siteUrl(),
        brand: QUOTE_CARD_BRAND,
      });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setState({ step: "ready", blob, url, quote: finalQuote });
    } catch {
      setState({ step: "error", message: "ساخت تصویر در این مرورگر ممکن نشد." });
    }
  };

  const share = async () => {
    if (state.step !== "ready") return;
    const method = await shareOrDownload(state.blob, {
      filename: cardFileName(book.slug),
      title: book.title,
      text: `«${state.quote}» — ${book.title}`,
      url: productUrl,
    });
    if (method !== "cancelled") trackQuoteCardShared({ book: book.slug, chars: state.quote.length, method });
  };

  return (
    <Dialog open={open} onClose={onClose} title="اشتراک به‌صورت تصویر" placement="sheet">
      {state.step === "ready" ? (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={state.url}
            alt={`تصویر نقل‌قول از کتاب ${book.title}`}
            width={1080}
            height={1350}
            className="mx-auto h-auto max-h-[55dvh] w-auto rounded-control border border-line"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-control px-5 font-bold text-primary hover:bg-primary-soft"
            >
              بستن
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-primary px-6 font-bold text-surface hover:bg-primary-hover"
            >
              <ImageShareIcon size={20} />
              اشتراک یا ذخیره تصویر
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <blockquote className="max-h-40 overflow-y-auto border-s-4 border-accent ps-3 text-sm leading-7">«{text}»</blockquote>
          <p className="text-xs leading-6 text-ink-muted">
            تصویر ۱۰۸۰×۱۳۵۰ با نام کتاب و نشانی سایت ساخته می‌شود و {formatNumber(text.length)} نویسه از سهمیه کپی این کتاب
            کم می‌شود
            {Number.isFinite(left) ? ` (باقی‌مانده: ${formatNumber(left)} نویسه)` : ""}. حداکثر {formatNumber(QUOTE_MAX)} نویسه.
          </p>
          {state.step === "error" && (
            <p role="alert" className="text-sm font-bold text-danger">
              {state.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-control px-5 font-bold text-primary hover:bg-primary-soft"
            >
              انصراف
            </button>
            <button
              type="button"
              disabled={state.step === "working" || left <= 0}
              onClick={() => void build()}
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface hover:bg-primary-hover disabled:opacity-60"
            >
              {state.step === "working" ? "در حال ساخت…" : left <= 0 ? "سهمیه تمام شده است" : "ساخت تصویر"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
