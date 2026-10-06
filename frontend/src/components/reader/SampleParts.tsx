"use client";

import Link from "next/link";
import { trackSampleCtaClick } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { formatNumber, formatToman } from "@/lib/format";
import { buyHref, sampleShare } from "@/lib/reader-stream";
import type { SampleSession, StatuteLink } from "@/lib/types";

/**
 * د۵ end of the free sample: «پایان نمونه رایگان» with the ebook / bundle offers (quick buy), or a
 * link to the full book when the visitor already owns it.
 */
export function SampleEndCta({ sample }: { sample: SampleSession }) {
  const slug = sample.book.slug;
  const offers = sample.offers.filter((o) => o.in_stock);
  return (
    <section
      aria-labelledby="sample-end-title"
      className="reader-sample-end mx-auto my-8 max-w-xl rounded-card border-2 border-accent bg-surface p-5 text-center shadow-card"
    >
      <p className="text-xs font-bold text-ink-muted">
        نمونه رایگان: {formatNumber(sample.sample_pages)} از {formatNumber(sample.total_pages)} صفحه (
        {formatNumber(sampleShare(sample))}٪)
      </p>
      <h2 id="sample-end-title" className="mt-2 text-lg font-bold leading-8">
        پایان نمونه رایگان «{sample.book.title}»
      </h2>
      {sample.owned ? (
        <>
          <p className="mt-2 text-sm leading-7 text-ink-muted">این کتاب در کتابخانه شماست؛ ادامه را در کتاب‌خوان بخوانید.</p>
          <Link
            href={routes.read(slug)}
            prefetch={false}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface hover:bg-primary-hover"
          >
            ادامه مطالعه کامل کتاب
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            برای خواندن ادامه کتاب، نسخه الکترونیک یا بسته چاپی و الکترونیک را تهیه کنید؛ هایلایت و یادداشت هم فعال می‌شود.
          </p>
          <div className="mt-4 grid gap-2">
            {offers.map((o, i) => (
              <Link
                key={o.id}
                href={buyHref(o.id)}
                prefetch={false}
                onClick={() => trackSampleCtaClick({ book: slug, variant: o.type, price: o.price })}
                className={`inline-flex min-h-12 items-center justify-between gap-3 rounded-control px-4 font-bold ${
                  i === 0 ? "bg-primary text-surface hover:bg-primary-hover" : "border border-primary text-primary hover:bg-primary-soft"
                }`}
              >
                <span>خرید {o.label}</span>
                <span className="tabular-nums">{formatToman(o.price)}</span>
              </Link>
            ))}
            <Link
              href={routes.product(slug)}
              prefetch={false}
              onClick={() => trackSampleCtaClick({ book: slug, variant: "product" })}
              className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-bold text-primary hover:bg-primary-soft"
            >
              {offers.length ? "مشاهده صفحه کتاب" : "مشاهده صفحه کتاب و خرید"}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

/** ه۶ «شرح این ماده: …» cards at the end of a statute chapter (outside the text, so offsets stay put). */
export function StatuteLinkCards({ links }: { links: StatuteLink[] }) {
  if (!links.length) return null;
  return (
    <aside aria-label="کتاب‌های شرح این بخش" className="mx-auto my-6 max-w-xl space-y-2">
      {links.map((l) => (
        <Link
          key={l.id}
          href={routes.product(l.book.slug)}
          prefetch={false}
          className="flex min-h-11 flex-col gap-0.5 rounded-card border border-line bg-surface p-3 text-start shadow-card hover:border-primary"
        >
          <span className="text-xs font-bold text-ink-muted">{l.label || "شرح این ماده"}</span>
          <span className="text-sm font-bold leading-7 text-primary">شرح این ماده: {l.book.title}</span>
          {l.book.authors.length > 0 && <span className="text-xs text-ink-muted">{l.book.authors.join("، ")}</span>}
        </Link>
      ))}
    </aside>
  );
}
