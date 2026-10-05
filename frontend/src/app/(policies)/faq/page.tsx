import type { Metadata } from "next";
import { FAQ, FAQ_PAGE, faqJsonLd } from "@/lib/content/policies";
import { serializeJsonLd } from "@/lib/jsonld";
import { ChevronIcon } from "@/components/ui/Icons";
import { PolicyShell } from "../PolicyShell";

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
      </div>
    </PolicyShell>
  );
}
