"use client";

import { useRef, useState } from "react";
import type { SamplePage } from "@/lib/types";
import { toPersianDigits } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { BookOpenIcon } from "@/components/ui/Icons";
import { ImageSlider, type ImageSliderHandle, type Slide } from "./ImageSlider";

export function sampleSlides(pages: SamplePage[], title: string): Slide[] {
  return [...pages]
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ key: p.id, src: p.image, alt: `نمونه صفحه ${toPersianDigits(i + 1)} از کتاب ${title}` }));
}

/** "ورق بزنید" — sample pages in a modal (swipe, buttons, ←/→; RTL: ← is "next"). */
export function SamplePagesViewer({ pages, title }: { pages: SamplePage[]; title: string }) {
  const [open, setOpen] = useState(false);
  const slider = useRef<ImageSliderHandle>(null);
  const slides = sampleSlides(pages, title);
  if (slides.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-primary bg-surface px-4 font-bold text-primary hover:bg-primary-soft"
      >
        <BookOpenIcon size={20} />
        ورق بزنید
        <span className="text-xs font-medium text-ink-muted">({toPersianDigits(slides.length)} صفحه نمونه)</span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`نمونه صفحات «${title}»`}
        size="lg"
        onKeyDown={(e) => slider.current?.onKey(e)}
      >
        <ImageSlider ref={slider} slides={slides} label="نمونه صفحات" active={open} />
      </Dialog>
    </>
  );
}
