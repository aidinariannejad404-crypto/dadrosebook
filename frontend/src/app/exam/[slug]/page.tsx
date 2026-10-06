import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getExamHub } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { examCountdown } from "@/lib/countdown";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { hubRobots, metaDescription } from "@/lib/hubs";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { collectionPageJsonLd } from "@/lib/jsonld-hubs";
import type { ExamHub } from "@/lib/types";
import { BookRail } from "@/components/book/BookRail";
import { HubCtaLink } from "@/components/hub/HubCtaLink";
import { ChipLinks, CourseGrid, GuideList, HubHeader, HubIntro, HubSection, HubShell, JsonLd } from "@/components/hub/HubParts";
import { CalendarIcon, PackageIcon } from "@/components/ui/Icons";

type Params = Promise<{ slug: string }>;

const loadHub = cache(async (rawSlug: string) => getExamHub(decodeSlug(rawSlug)));

const title = (hub: ExamHub) => `منابع آزمون ${hub.exam.name}`;

function fallbackDescription(hub: ExamHub): string {
  return `کتاب‌های آزمون ${hub.exam.name} به تفکیک درس، منابع ضروری بسته مطالعاتی، شمارش معکوس آزمون و دوره‌های آکادمی دادرُز در ${SITE_NAME}.`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hub = await loadHub((await params).slug);
  if (!hub) return { title: "آزمون پیدا نشد" };
  const path = routes.exam(hub.exam.slug);
  const description = metaDescription(hub.exam.intro, fallbackDescription(hub));
  return {
    title: title(hub),
    description,
    alternates: { canonical: path },
    robots: hubRobots(hub.indexable),
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE_NAME, title: title(hub), description, url: path },
  };
}

function Countdown({ hub, now }: { hub: ExamHub; now: number }) {
  const event = hub.next_event;
  if (!event) return null;
  const { days, past } = examCountdown(event.date, now);
  if (past) return null;
  return (
    <div className="flex items-center gap-3 rounded-card bg-primary px-4 py-3 text-white shadow-card">
      <CalendarIcon size={28} className="shrink-0 text-accent" />
      <p className="leading-6">
        <span className="block text-xs text-white/85">{event.name}</span>
        <span className="block text-lg font-black">
          {toPersianDigits(days)} روز مانده
        </span>
        <span className="block text-xs text-white/85">{formatJalaliDate(event.date)}</span>
      </p>
    </div>
  );
}

export default async function ExamHubPage({ params }: { params: Params }) {
  const hub = await loadHub((await params).slug);
  if (!hub) notFound();

  const site = siteUrl();
  const path = routes.exam(hub.exam.slug);
  const crumbs = [{ name: "خانه", href: routes.home }, { name: `آزمون ${hub.exam.name}` }];
  const books = hub.groups.flatMap((g) => g.books);
  const jsonLd = [
    collectionPageJsonLd({
      site,
      path,
      name: title(hub),
      description: metaDescription(hub.exam.intro, fallbackDescription(hub)),
      books,
      dateModified: hub.updated_at,
    }),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];
  const now = Date.now();
  const cta = { hub: "exam", slug: hub.exam.slug };

  return (
    <HubShell crumbs={crumbs}>
      <JsonLd data={jsonLd} />
      <HubHeader
        eyebrow="منابع آزمون"
        title={title(hub)}
        subtitle={`${toPersianDigits(hub.book_count)} کتاب در ${toPersianDigits(hub.groups.length)} درس، به ترتیب ضریب درس‌ها`}
        aside={<Countdown hub={hub} now={now} />}
      />

      {hub.kit.book_count > 0 && (
        <section
          aria-labelledby="kit-cta-title"
          className="mt-5 flex flex-col gap-3 rounded-card border-2 border-accent bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
        >
          <div className="flex items-start gap-3">
            <PackageIcon size={28} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <h2 id="kit-cta-title" className="text-base font-extrabold text-ink">
                کیت ضروری آزمون {hub.exam.name}
              </h2>
              <p className="mt-1 text-sm leading-7 text-ink">
                {toPersianDigits(hub.kit.essential_count)} منبع ضروری در {toPersianDigits(hub.kit.subject_count)} درس؛ با یک
                کلیک همه را به سبد اضافه کنید.
              </p>
            </div>
          </div>
          <HubCtaLink
            href={`${routes.kit}?exam=${encodeURIComponent(hub.exam.slug)}`}
            cta={{ ...cta, cta: "kit" }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"
          >
            ساخت کیت مطالعاتی
          </HubCtaLink>
        </section>
      )}

      <HubIntro html={hub.exam.intro} byline={hub.exam.intro_byline} updatedAt={hub.updated_at} />

      {hub.groups.length > 1 && (
        <nav aria-label="درس‌های این آزمون" className="mt-6">
          <ChipLinks
            label="پرش به درس"
            items={hub.groups.map((g, i) => ({
              key: g.subject?.id ?? `other-${i}`,
              href: `#subject-${g.subject?.slug ?? "other"}`,
              text: g.subject?.name ?? "سایر منابع",
              color: g.subject?.color,
            }))}
          />
        </nav>
      )}

      {hub.groups.map((g) => {
        const id = `subject-${g.subject?.slug ?? "other"}`;
        const more = g.subject && g.book_count > g.books.length;
        return (
          <section key={id} id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-4">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-extrabold text-ink md:text-xl">
                  <span aria-hidden="true" className="inline-block h-5 w-1.5 rounded-full" style={{ backgroundColor: g.subject?.color ?? "var(--color-accent)" }} />
                  {g.subject ? `منابع ${g.subject.name}` : "سایر منابع"}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {[g.weight != null ? `ضریب ${toPersianDigits(g.weight)}` : null, `${toPersianDigits(g.book_count)} کتاب`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {g.subject && (
                <HubCtaLink
                  href={more ? routes.search({ exam_type: hub.exam.slug, subject: g.subject.slug }) : routes.subject(g.subject.slug)}
                  cta={{ ...cta, cta: more ? "all_books" : "subject_hub" }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
                >
                  {more ? "همه کتاب‌ها" : `درباره ${g.subject.name}`}
                </HubCtaLink>
              )}
            </div>
            <BookRail books={g.books} labelledBy={`${id}-title`} />
          </section>
        );
      })}

      {hub.guides.length > 0 && (
        <HubSection id="guides-title" title="راهنمای انتخاب منابع">
          <GuideList guides={hub.guides} />
        </HubSection>
      )}

      {hub.courses.length > 0 && (
        <HubSection id="courses-title" title={`دوره‌های آکادمی دادرُز برای ${hub.exam.name}`} subtitle="کلاس و کتاب را با هم برنامه‌ریزی کنید">
          <CourseGrid courses={hub.courses} placement={`exam-hub-${hub.exam.slug}`} />
        </HubSection>
      )}
    </HubShell>
  );
}
