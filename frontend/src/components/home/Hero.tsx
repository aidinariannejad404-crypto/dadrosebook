import Link from "next/link";
import Image from "next/image";
import type { Banner, BookCard, StoreSettings } from "@/lib/types";
import { BookCover } from "@/components/book/BookCover";
import { ConsultCta } from "@/components/ui/ConsultCta";
import { ChevronIcon } from "@/components/ui/Icons";

/** First hero banner; generated covers of top sellers as the visual when no banner image exists. */
export function Hero({
  banner,
  books,
  store,
  examName,
}: {
  banner: Banner | undefined;
  books: BookCard[];
  store: StoreSettings | null;
  examName?: string | null;
}) {
  if (!banner) return null;
  const stack = books.slice(0, 3);
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-card bg-primary text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_100%,color-mix(in_srgb,var(--color-accent)_28%,transparent),transparent_60%)]"
      />
      <div className="relative grid items-center gap-6 px-5 py-8 md:grid-cols-[1.2fr_1fr] md:px-10 md:py-12">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-accent">
            {examName ? `ویژه داوطلبان ${examName}` : "ویژه داوطلبان آزمون وکالت"}
          </p>
          <h1 id="hero-title" className="text-2xl font-black leading-[1.6] md:text-4xl md:leading-[1.5]">
            {banner.title}
          </h1>
          {banner.subtitle && <p className="mt-3 max-w-xl text-sm leading-7 text-white/85 md:text-base md:leading-8">{banner.subtitle}</p>}
          <Link
            prefetch={false}
            href={banner.link_url || "/kit"}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-control bg-accent px-6 text-base font-extrabold text-ink shadow-card transition-transform hover:-translate-y-0.5"
          >
            {banner.link_label || "ساخت بسته مطالعاتی"}
            <ChevronIcon size={20} />
          </Link>
          <ConsultCta store={store} exam={examName} tone="dark" className="mt-6 max-w-sm border-t border-white/15 pt-4" />
        </div>
        {banner.image ? (
          <div className="relative aspect-[4/3] w-full">
            <Image src={banner.image} alt="" fill priority sizes="(min-width: 768px) 40vw, 90vw" className="object-contain" />
          </div>
        ) : (
          stack.length > 0 && (
            // Mobile shows a compact trio too (UI refresh); only the first cover may be
            // preloaded and every image is requested at its small rendered size, so the hero text
            // stays the LCP element and nothing shifts (fixed-size boxes).
            <div aria-hidden="true" className="relative mx-auto h-40 w-full max-w-[17rem] md:h-72 md:max-w-sm">
              <div className="absolute inset-x-6 bottom-2 h-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.35),transparent)] md:bottom-6" />
              {stack.map((b, i) => (
                <div
                  key={b.id}
                  className="absolute top-1/2 w-[6.25rem] md:w-40"
                  style={{
                    insetInlineStart: `${i * 30}%`,
                    transform: `translateY(-50%) rotate(${(i - 1) * 7}deg)${i === 1 ? " scale(1.08)" : ""}`,
                    zIndex: i === 1 ? 3 : 2 - i,
                  }}
                >
                  <BookCover
                    title={b.title}
                    cover={b.cover}
                    subjects={b.subjects}
                    authors={b.authors}
                    volumes={b.volumes}
                    sizes="(min-width: 768px) 160px, 100px"
                    variant="hero"
                  />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
