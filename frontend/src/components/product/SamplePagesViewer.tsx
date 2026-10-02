"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { SamplePage } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { BookOpenIcon, ChevronIcon } from "@/components/ui/Icons";

/**
 * "ورق بزنید" — sample pages in a modal. Native scroll-snap gives touch swipe for free;
 * buttons and ←/→ keys page through (RTL: ← is "next").
 */
export function SamplePagesViewer({ pages, title }: { pages: SamplePage[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const sorted = [...pages].sort((a, b) => a.order - b.order);
  const count = sorted.length;

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(count - 1, i));
      setIndex(next);
      const el = trackRef.current?.children[next] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    },
    [count],
  );

  // keep the counter in sync when the user swipes
  useEffect(() => {
    const track = trackRef.current;
    if (!open || !track) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setIndex(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root: track, threshold: 0.6 },
    );
    Array.from(track.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [open]);

  if (count === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary bg-surface px-4 font-bold text-primary hover:bg-primary-soft"
      >
        <BookOpenIcon size={20} />
        ورق بزنید
        <span className="text-xs font-medium text-ink-muted">({toPersianDigits(count)} صفحه نمونه)</span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`نمونه صفحات «${title}»`}
        size="lg"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(index + 1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(index - 1);
          }
        }}
      >
        <div
          ref={trackRef}
          className="relative no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-control bg-bg"
          aria-roledescription="اسلایدر"
          aria-label="نمونه صفحات"
        >
          {sorted.map((p, i) => (
            <figure
              key={p.id}
              data-index={i}
              className="relative aspect-[600/850] max-h-[65vh] w-full shrink-0 snap-start"
              aria-roledescription="اسلاید"
              aria-label={`صفحه ${toPersianDigits(i + 1)} از ${toPersianDigits(count)}`}
            >
              <Image
                src={p.image}
                alt={`نمونه صفحه ${toPersianDigits(i + 1)} از کتاب ${title}`}
                fill
                sizes="(min-width: 768px) 700px, 92vw"
                className="object-contain"
                unoptimized={p.image.endsWith(".svg")}
              />
            </figure>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-3 font-bold text-primary hover:bg-primary-soft disabled:opacity-40"
          >
            <ChevronIcon size={20} className="rotate-180" />
            قبلی
          </button>
          <p className="text-sm text-ink-muted" aria-live="polite">
            صفحه {toPersianDigits(index + 1)} از {toPersianDigits(count)}
          </p>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === count - 1}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-3 font-bold text-primary hover:bg-primary-soft disabled:opacity-40"
          >
            بعدی
            <ChevronIcon size={20} />
          </button>
        </div>
      </Dialog>
    </>
  );
}
