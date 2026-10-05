"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import { toPersianDigits } from "@/lib/format";
import { ChevronIcon } from "@/components/ui/Icons";

export interface Slide {
  key: string | number;
  src: string;
  alt: string;
  /** natural aspect ratio (width / height), used for the frame */
  ratio?: number;
}

export interface ImageSliderHandle {
  /** ←/→ keys (RTL: ← is "next") */
  onKey: (e: React.KeyboardEvent) => void;
}

/**
 * Swipeable slides for a <Dialog>: native scroll-snap gives touch swipe for free; buttons and the
 * parent's ←/→ keys page through. `active` mounts the IntersectionObserver only while visible.
 */
export const ImageSlider = forwardRef<ImageSliderHandle, { slides: Slide[]; label: string; active: boolean; start?: number }>(
  function ImageSlider({ slides, label, active, start = 0 }, ref) {
    const [index, setIndex] = useState(start);
    const trackRef = useRef<HTMLDivElement>(null);
    const count = slides.length;

    const goTo = useCallback(
      (i: number, behavior: ScrollBehavior = "smooth") => {
        const next = Math.max(0, Math.min(count - 1, i));
        setIndex(next);
        const el = trackRef.current?.children[next] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior, block: "nearest", inline: "start" });
      },
      [count],
    );

    useImperativeHandle(
      ref,
      () => ({
        onKey: (e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(index + 1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(index - 1);
          }
        },
      }),
      [goTo, index],
    );

    // open on the requested slide; keep the counter in sync when the user swipes
    useEffect(() => {
      const track = trackRef.current;
      if (!active || !track) return;
      goTo(start, "instant");
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
    }, [active, start, goTo]);

    if (count === 0) return null;

    return (
      <>
        <div
          ref={trackRef}
          className="relative no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-control bg-bg"
          aria-roledescription="اسلایدر"
          aria-label={label}
        >
          {slides.map((s, i) => (
            <figure
              key={s.key}
              data-index={i}
              className="relative max-h-[65vh] w-full shrink-0 snap-start"
              style={{ aspectRatio: s.ratio ?? 600 / 850 }}
              aria-roledescription="اسلاید"
              aria-label={`${toPersianDigits(i + 1)} از ${toPersianDigits(count)}`}
            >
              <Image
                src={s.src}
                alt={s.alt}
                fill
                sizes="(min-width: 768px) 700px, 92vw"
                className="object-contain"
                unoptimized={s.src.endsWith(".svg")}
              />
            </figure>
          ))}
        </div>
        {count > 1 && (
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
              {toPersianDigits(index + 1)} از {toPersianDigits(count)}
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
        )}
      </>
    );
  },
);
