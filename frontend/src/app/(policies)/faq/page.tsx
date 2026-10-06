import type { Metadata } from "next";
import { FAQ, FAQ_PAGE, faqJsonLd } from "@/lib/content/policies";
import { serializeJsonLd } from "@/lib/jsonld";
import { ChevronIcon } from "@/components/ui/Icons";
import { PolicyShell } from "../PolicyShell";
import Link from "next/link"; // platform stream (PF-11)

export const metadata: Metadata = {
  title: FAQ_PAGE.title,
  description: FAQ_PAGE.description,
  alternates: { canonical: FAQ_PAGE.path },
  openGraph: { title: FAQ_PAGE.title, description: FAQ_PAGE.description, url: FAQ_PAGE.path, locale: "fa_IR", type: "website" },
};

/** Native <details> accordions: no JavaScript, answers stay in the HTML for search engines. */
export default function FaqPage() {
  return (
    <PolicyShell current={FAQ_PAGE.path} title={FAQ_PAGE.title} intro={FAQ_PAGE.intro}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd(FAQ)) }} />
      <div className="space-y-8">
        {FAQ.map((group, gi) => (
          <section key={group.title} aria-labelledby={`faq-${gi}`}>
            <h2 id={`faq-${gi}`} className="text-lg font-extrabold text-ink">
              {group.title}
            </h2>
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {group.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold leading-7 text-ink hover:bg-primary-soft focus-visible:bg-primary-soft [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <ChevronIcon size={20} className="shrink-0 -rotate-90 text-ink-muted transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="px-4 pb-4 leading-8 text-ink">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
        {/* platform stream (PF-11): answer not found → ticket */}
        <section aria-labelledby="faq-support" className="rounded-card bg-primary-soft p-4">
          <h2 id="faq-support" className="text-lg font-extrabold text-ink">
            پاسخ پرسشتان را پیدا نکردید؟
          </h2>
          <p className="mt-1 text-sm leading-7 text-ink">درخواست پشتیبانی ثبت کنید؛ کد پیگیری می‌گیرید و پاسخ برایتان پیامک می‌شود.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/support?source=faq" className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover">
              ثبت درخواست پشتیبانی
            </Link>
            <Link href="/support/track" className="inline-flex min-h-11 items-center rounded-control px-4 font-bold text-primary hover:bg-surface">
              پیگیری درخواست
            </Link>
          </div>
        </section>
      </div>
    </PolicyShell>
  );
}
