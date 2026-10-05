import Link from "next/link";
import type { ReactNode } from "react";
import { getStoreSettings } from "@/lib/api";
import { POLICY_PAGES, type PolicyPage } from "@/lib/content/policies";
import { Breadcrumb } from "@/components/product/Breadcrumb";
import { ConsultCta } from "@/components/ui/ConsultCta";

/** Shared frame of the policy pages: breadcrumb, title, side navigation and the support box. */
export async function PolicyShell({
  current,
  title,
  intro,
  children,
}: {
  current: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const store = await getStoreSettings().catch(() => null);
  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-2 md:pt-4">
      <Breadcrumb items={[{ name: "خانه", href: "/" }, { name: title }]} />
      <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-10">
        <article className="min-w-0">
          <h1 className="text-2xl font-black leading-[2.75rem] text-ink md:text-3xl md:leading-[3.25rem]">{title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-8 text-ink">{intro}</p>
          <div className="mt-6 max-w-3xl">{children}</div>
          <div className="mt-10 max-w-3xl rounded-card bg-surface p-4 shadow-card md:p-5">
            <h2 className="text-base font-extrabold text-ink">پرسشی دارید؟</h2>
            <p className="mt-1 text-sm leading-7 text-ink-muted">
              پشتیبانی دادرُز درباره سفارش، ارسال و انتخاب منبع پاسخگوی شماست.
            </p>
            <div className="mt-3">
              <ConsultCta store={store} exam={null} book={null} />
            </div>
          </div>
        </article>
        <nav aria-label="راهنمای خرید" className="order-first min-w-0 md:order-none">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:sticky md:top-4 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:rounded-card md:bg-surface md:p-2 md:shadow-card">
            {POLICY_PAGES.map((p) => {
              const active = p.path === current;
              return (
                <li key={p.path} className="shrink-0">
                  <Link
                    href={p.path}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 w-full items-center whitespace-nowrap rounded-control px-4 text-sm font-bold md:px-3 ${
                      active
                        ? "bg-primary text-white"
                        : "border border-line bg-surface text-ink hover:bg-primary-soft hover:text-primary md:border-0"
                    }`}
                  >
                    {p.nav}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** Headings, paragraphs and bullet lists of a policy page. */
export function PolicySections({ page }: { page: PolicyPage }) {
  return (
    <div className="space-y-8">
      {page.sections.map((s) => (
        <section key={s.heading} aria-labelledby={`s-${slugId(s.heading)}`}>
          <h2 id={`s-${slugId(s.heading)}`} className="text-lg font-extrabold text-ink">
            {s.heading}
          </h2>
          {s.paragraphs?.map((p) => (
            <p key={p} className="mt-2 leading-8 text-ink">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-3 space-y-2">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2 leading-8 text-ink">
                  <span aria-hidden="true" className="mt-3.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function slugId(text: string): string {
  return text.replace(/\s+/g, "-");
}
