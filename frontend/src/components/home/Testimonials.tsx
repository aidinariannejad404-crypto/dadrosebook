import Link from "next/link";
import type { Testimonial } from "@/lib/types";
import { routes } from "@/lib/config";
import { Stars } from "@/components/reviews/Stars";
import { CheckIcon } from "@/components/ui/Icons";
import { HomeSectionHeader } from "./HomeSectionHeader";

/**
 * Social-proof strip: real, moderated reviews only (approved 4–5★ with text, from the API).
 * Nothing is ever padded or invented — no reviews, no strip.
 */
export function Testimonials({ items }: { items: Testimonial[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="testimonials-title">
      <HomeSectionHeader id="testimonials-title" title="داوطلبان درباره کتاب‌ها" subtitle="نظرهای تأییدشده خریداران" />
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {items.map((t) => (
          <li key={t.id} className="w-[82%] max-w-[20rem] shrink-0 snap-start md:w-auto md:max-w-none">
            <figure className="relative flex h-full flex-col gap-3 overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-3 end-3 select-none font-serif text-7xl leading-none text-accent opacity-40"
              >
                ”
              </span>
              <Stars value={t.rating} size={15} />
              <blockquote className="flex-1 text-sm leading-7 text-ink">{t.body}</blockquote>
              <figcaption className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-muted">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-sm text-ink">{t.author}</strong>
                  {t.is_verified_purchase && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-bold text-success">
                      <CheckIcon size={12} strokeWidth={2.6} />
                      خریدار تأییدشده
                    </span>
                  )}
                  {t.exam_type && <span>داوطلب {t.exam_type.name}</span>}
                </span>
                <span>
                  درباره{" "}
                  <Link
                    prefetch={false}
                    href={routes.product(t.book.slug)}
                    className="inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline"
                  >
                    {t.book.title}
                  </Link>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
