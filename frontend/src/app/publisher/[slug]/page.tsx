import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getPublisherHub } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { hubRobots, metaDescription } from "@/lib/hubs";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { collectionPageJsonLd } from "@/lib/jsonld-hubs";
import type { PublisherHub } from "@/lib/types";
import { BookGrid, ChipLinks, HubHeader, HubIntro, HubSection, HubShell, JsonLd } from "@/components/hub/HubParts";

type Params = Promise<{ slug: string }>;

const loadHub = cache(async (rawSlug: string) => getPublisherHub(decodeSlug(rawSlug)));

const title = (hub: PublisherHub) => `کتاب‌های نشر ${hub.publisher.name}`;

function fallbackDescription(hub: PublisherHub): string {
  return `${toPersianDigits(hub.book_count)} کتاب حقوقی انتشارات ${hub.publisher.name} برای آزمون وکالت، قضاوت و ارشد؛ نسخه چاپی و الکترونیک در ${SITE_NAME}.`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hub = await loadHub((await params).slug);
  if (!hub) return { title: "ناشر پیدا نشد" };
  const path = routes.publisher(hub.publisher.slug);
  const description = metaDescription(hub.publisher.intro, fallbackDescription(hub));
  return {
    title: title(hub),
    description,
    alternates: { canonical: path },
    robots: hubRobots(hub.indexable),
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE_NAME, title: title(hub), description, url: path },
  };
}

export default async function PublisherPage({ params }: { params: Params }) {
  const hub = await loadHub((await params).slug);
  if (!hub) notFound();

  const site = siteUrl();
  const path = routes.publisher(hub.publisher.slug);
  const crumbs = [{ name: "خانه", href: routes.home }, { name: `نشر ${hub.publisher.name}` }];
  const jsonLd = [
    collectionPageJsonLd({
      site,
      path,
      name: title(hub),
      description: metaDescription(hub.publisher.intro, fallbackDescription(hub)),
      books: hub.books,
      dateModified: hub.updated_at,
    }),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];

  return (
    <HubShell crumbs={crumbs}>
      <JsonLd data={jsonLd} />
      <HubHeader
        eyebrow="ناشر"
        title={title(hub)}
        subtitle={
          <>
            {toPersianDigits(hub.book_count)} کتاب در فروشگاه
            {hub.publisher.website && (
              <>
                {" · "}
                <a href={hub.publisher.website} target="_blank" rel="noopener" className="font-bold text-primary hover:underline">
                  وب‌سایت ناشر<span className="sr-only"> (در زبانه جدید باز می‌شود)</span>
                </a>
              </>
            )}
          </>
        }
      />
      {hub.subjects.length > 0 && (
        <nav aria-label="درس‌ها" className="mt-4">
          <ChipLinks
            label="درس‌ها"
            items={hub.subjects.map((s) => ({ key: s.id, href: routes.subject(s.slug), text: s.name, color: s.color }))}
          />
        </nav>
      )}
      <HubIntro html={hub.publisher.intro} />
      <HubSection id="books-title" title={`کتاب‌های ${hub.publisher.name}`} subtitle="پرفروش‌ترین‌ها اول">
        <BookGrid books={hub.books} labelledBy="books-title" />
      </HubSection>
      {hub.authors.length > 0 && (
        <HubSection id="authors-title" title="نویسندگان این ناشر">
          <ChipLinks
            label="نویسندگان این ناشر"
            items={hub.authors.map((a) => ({
              key: a.person.id,
              href: routes.author(a.person.slug),
              text: `${a.person.name} (${toPersianDigits(a.book_count)})`,
            }))}
          />
        </HubSection>
      )}
    </HubShell>
  );
}
