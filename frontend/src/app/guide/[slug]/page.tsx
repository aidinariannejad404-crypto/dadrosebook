import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeSlug, getGuide } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { guideBylineText, guideRobots, metaDescription, updatedLabel } from "@/lib/hubs";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { articleJsonLd } from "@/lib/jsonld-hubs";
import { NOINDEX } from "@/lib/seo";
import { BookGrid, ChipLinks, GuideBylineLine, HubSection, HubShell, JsonLd } from "@/components/hub/HubParts";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function load(params: Params, searchParams: SearchParams) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return getGuide(decodeSlug(slug), first(sp.preview));
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const guide = await load(params, searchParams);
  if (!guide) return { title: "راهنما پیدا نشد", robots: NOINDEX };
  const path = routes.guide(guide.slug);
  const description = guide.summary || metaDescription(guide.intro || guide.body, `${guide.title} — ${SITE_NAME}`);
  return {
    title: guide.title,
    description,
    alternates: { canonical: path },
    robots: guide.is_published ? guideRobots(guide) : NOINDEX,
    authors: [guide.author, guide.reviewer].filter((p) => p !== null).map((p) => ({ name: p.name, url: routes.author(p.slug) })),
    openGraph: {
      type: "article",
      locale: "fa_IR",
      siteName: SITE_NAME,
      title: guide.title,
      description,
      url: path,
      publishedTime: guide.published_at ?? undefined,
      modifiedTime: guide.updated_on ?? guide.updated_at,
      authors: guide.author ? [guide.author.name] : undefined,
    },
  };
}

export default async function GuidePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const guide = await load(params, searchParams);
  if (!guide) notFound();

  const site = siteUrl();
  const path = routes.guide(guide.slug);
  const crumbs = [{ name: "خانه", href: routes.home }, { name: guide.title }];
  const jsonLd = [
    articleJsonLd(site, guide),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];
  const updated = updatedLabel(guide.updated_on ?? guide.updated_at);

  return (
    <HubShell crumbs={crumbs}>
      {guide.is_published && <JsonLd data={jsonLd} />}
      {!guide.is_published && (
        <p role="status" className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
          پیش‌نمایش پیش‌نویس — این صفحه هنوز منتشر نشده و فقط با لینک پیش‌نمایش دیده می‌شود.
        </p>
      )}
      <article className="mx-auto mt-2 max-w-3xl">
        <header>
          <h1 className="text-2xl font-black leading-10 text-ink md:text-3xl md:leading-[3rem]">{guide.title}</h1>
          <GuideBylineLine guide={guide} className="mt-3" />
          {updated && (
            <p className="mt-1 text-sm text-ink-muted">
              <time dateTime={(guide.updated_on ?? guide.updated_at).slice(0, 10)}>{updated}</time>
            </p>
          )}
          {(guide.exam_types.length > 0 || guide.subjects.length > 0) && (
            <div className="mt-3">
              <ChipLinks
                label="موضوع‌ها"
                items={[
                  ...guide.exam_types.map((e) => ({ key: `e${e.id}`, href: routes.exam(e.slug), text: `آزمون ${e.name}` })),
                  ...guide.subjects.map((s) => ({ key: `s${s.id}`, href: routes.subject(s.slug), text: s.name, color: s.color })),
                ]}
              />
            </div>
          )}
        </header>
        {guide.intro && (
          <div className="rich-text mt-6 text-base font-medium" dangerouslySetInnerHTML={{ __html: guide.intro }} />
        )}
        <div className="rich-text mt-6 text-[0.9375rem]" dangerouslySetInnerHTML={{ __html: guide.body }} />
        {guideBylineText(guide) && (
          <footer className="mt-8 rounded-card border border-line bg-surface p-4 text-sm leading-7 text-ink-muted">
            <GuideBylineLine guide={guide} />
            <p className="mt-1">
              اگر نکته‌ای از این راهنما با قانون یا رویه تازه هم‌خوان نیست، از راه پشتیبانی به ما خبر دهید تا بازبینی شود.
            </p>
          </footer>
        )}
      </article>

      {guide.books.length > 0 && (
        <HubSection id="guide-books-title" title="کتاب‌های معرفی‌شده در این راهنما">
          <BookGrid books={guide.books} labelledBy="guide-books-title" />
        </HubSection>
      )}
    </HubShell>
  );
}
