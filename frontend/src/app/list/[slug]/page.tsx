import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getCuratedList } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { listRobots, metaDescription } from "@/lib/hubs";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { collectionPageJsonLd } from "@/lib/jsonld-hubs";
import { BookCard } from "@/components/book/BookCard";
import { HubHeader, HubIntro, HubShell, JsonLd } from "@/components/hub/HubParts";
import { ShareButton } from "@/components/product/ShareButton";

type Params = Promise<{ slug: string }>;

const loadList = cache(async (rawSlug: string) => getCuratedList(decodeSlug(rawSlug)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const list = await loadList((await params).slug);
  if (!list) return { title: "فهرست پیدا نشد" };
  const path = routes.list(list.slug);
  const description = metaDescription(list.intro, `${list.title}: فهرست پیشنهادی ${SITE_NAME}`);
  return {
    title: list.title,
    description,
    alternates: { canonical: path },
    robots: listRobots(list),
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE_NAME, title: list.title, description, url: path },
  };
}

export default async function CuratedListPage({ params }: { params: Params }) {
  const list = await loadList((await params).slug);
  if (!list) notFound();

  const site = siteUrl();
  const path = routes.list(list.slug);
  const url = `${site}${path}`;
  const crumbs = [{ name: "خانه", href: routes.home }, { name: list.title }];
  const books = list.entries.map((e) => e.book);
  const jsonLd = [
    collectionPageJsonLd({
      site,
      path,
      name: list.title,
      description: metaDescription(list.intro, list.title),
      books,
      dateModified: list.updated_at,
    }),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];

  return (
    <HubShell crumbs={crumbs}>
      <JsonLd data={jsonLd} />
      <HubHeader
        eyebrow="فهرست پیشنهادی دادرُز"
        title={list.title}
        subtitle={`${toPersianDigits(list.book_count)} کتاب${list.ends_on && !list.is_expired ? ` · تا ${formatJalaliDate(list.ends_on)}` : ""}`}
        aside={<ShareButton url={url} title={list.title} text={`فهرست «${list.title}» در فروشگاه دادرُز`} />}
      />
      {list.is_expired && (
        <p role="status" className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
          این فهرست به پایان رسیده است؛ قیمت‌ها و موجودی امروز را نشان می‌دهیم.
        </p>
      )}
      <HubIntro html={list.intro} />
      <ol aria-label={list.title} className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
        {list.entries.map((e, i) => (
          <li key={e.book.id} className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-primary">#{toPersianDigits(i + 1)}</span>
            <BookCard book={e.book} />
            {e.note && <p className="text-xs leading-6 text-ink-muted">{e.note}</p>}
          </li>
        ))}
      </ol>
    </HubShell>
  );
}
