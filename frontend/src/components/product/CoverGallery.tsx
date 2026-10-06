"use client";

import { useRef, useState, type ReactNode } from "react";
import type { SamplePage } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { ImageSlider, type ImageSliderHandle, type Slide } from "./ImageSlider";
import { sampleSlides } from "./SamplePagesViewer";

/**
 * Tap the cover → lightbox with the cover photo and the sample pages. The cover stays a
 * server-rendered child; without a cover photo or sample pages it is not interactive.
 */
export function CoverGallery({
  cover,
  pages,
  title,
  children,
}: {
  cover: string | null;
  pages: SamplePage[];
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const slider = useRef<ImageSliderHandle>(null);
  const slides: Slide[] = [
    ...(cover ? [{ key: "cover", src: cover, alt: `جلد کتاب ${title}`, ratio: 0.7 }] : []),
    ...sampleSlides(pages, title),
  ];
  if (slides.length === 0) return <>{children}</>;

  return (
    <>
      {/* a full-size overlay button next to the cover (no block content inside a <button>) */}
      <div className="group relative">
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute inset-0 z-10 cursor-zoom-in rounded-card"
          aria-label={`بزرگ‌نمایی جلد${pages.length ? " و نمونه صفحات" : ""} «${title}»`}
          aria-haspopup="dialog"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 end-1 grid size-9 place-items-center rounded-full bg-surface text-primary shadow-card transition-transform group-hover:scale-110"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
            </svg>
          </span>
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="lg" onKeyDown={(e) => slider.current?.onKey(e)}>
        <ImageSlider ref={slider} slides={slides} label="جلد و نمونه صفحات" active={open} />
      </Dialog>
    </>
  );
}
