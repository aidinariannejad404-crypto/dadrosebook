import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getSubjectHub } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { hubRobots, metaDescription } from "@/lib/hubs";
import { breadcrumbJsonLd, stripHtml } from "@/lib/jsonld";
import { collectionPageJsonLd } from "@/lib/jsonld-hubs";
import type { SubjectHub } from "@/lib/types";
import { BookGrid, ChipLinks, CourseGrid, GuideList, HubHeader, HubIntro, HubSection, HubShell, JsonLd } from "@/components/hub/HubParts";

type Params = Promise<{ slug: string }>;

const loadHub = cache(async (rawSlug: string) => getSubjectHub(decodeSlug(rawSlug)));

const title = (hub: SubjectHub) => `کتاب‌های ${hub.subject.name}`;

function fallbackDescription(hub: SubjectHub): string {
  const own = stripHtml(hub.subject.description);
  if (own) return own.slice(0, 160);
  return `بهترین کتاب‌های ${hub.subject.name} برای آزمون وکالت، قضاوت و ارشد: درسنامه، تست و سریع‌خوان، نسخه چاپی و الکترونیک در ${SITE_NAME}.`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hub = await loadHub((await params).slug);
  if (!hub) return { title: "درس پیدا نشد" };
  const path = routes.subject(hub.subject.slug);
  const description = metaDescription(hub.subject.intro, fallbackDescription(hub));
  return {
    title: title(hub),
    description,
    alternates: { canonical: path },
    robots: hubRobots(hub.indexable),
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE_NAME, title: title(hub), description, url: path },
  };
}

export default async function SubjectHubPage({ params }: { params: Params }) {
  const hub = await loadHub((await params).slug);
  if (!hub) notFound();

  const site = siteUrl();
  const path = routes.subject(hub.subject.slug);
  const crumbs = [{ name: "خانه", href: routes.home }, { name: hub.subject.name }];
  const jsonLd = [
    collectionPageJsonLd({
      site,
      path,
      name: title(hub),
      description: metaDescription(hub.subject.intro, fallbackDescription(hub)),
      books: hub.books,
      dateModified: hub.updated_at,
    }),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];
  const description = stripHtml(hub.subject.description);

  return (
    <HubShell crumbs={crumbs}>
      <JsonLd data={jsonLd} />
      <HubHeader
        eyebrow="منابع درس"
        title={title(hub)}
        accent={hub.subject.color}
        subtitle={description || `${toPersianDigits(hub.book_count)} کتاب ${hub.subject.name}`}
      />

      {hub.exams.length > 0 && (
        <nav aria-label="این درس در آزمون‌ها" className="mt-4">
          <ChipLinks
            label="آزمون‌ها"
            items={hub.exams.map((e) => ({
              key: e.exam.id,
              href: routes.exam(e.exam.slug),
              text: `${e.exam.name} (${toPersianDigits(e.book_count)})`,
            }))}
          />
        </nav>
      )}

      <HubIntro html={hub.subject.intro} byline={hub.subject.intro_byline} updatedAt={hub.updated_at} />

      <HubSection
        id="books-title"
        title={`${toPersianDigits(hub.book_count)} کتاب ${hub.subject.name}`}
        subtitle="پرفروش‌ترین‌ها اول"
        href={hub.book_count > hub.books.length ? routes.search({ subject: hub.subject.slug }) : undefined}
      >
        {hub.books.length > 0 ? (
          <BookGrid books={hub.books} labelledBy="books-title" />
        ) : (
          <p className="rounded-card bg-surface p-6 text-center text-ink-muted shadow-card">هنوز کتابی برای این درس ثبت نشده است.</p>
        )}
      </HubSection>

      {hub.authors.length > 0 && (
        <HubSection id="authors-title" title={`نویسندگان ${hub.subject.name}`}>
          <ChipLinks
            label={`نویسندگان ${hub.subject.name}`}
            items={hub.authors.map((a) => ({
              key: a.person.id,
              href: routes.author(a.person.slug),
              text: `${a.person.name} (${toPersianDigits(a.book_count)})`,
            }))}
          />
        </HubSection>
      )}

      {hub.guides.length > 0 && (
        <HubSection id="guides-title" title="راهنماها">
          <GuideList guides={hub.guides} />
        </HubSection>
      )}

      {hub.courses.length > 0 && (
        <HubSection id="courses-title" title={`دوره‌های ${hub.subject.name} در آکادمی دادرُز`}>
          <CourseGrid courses={hub.courses} placement={`subject-hub-${hub.subject.slug}`} />
        </HubSection>
      )}
    </HubShell>
  );
}
