import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { decodeSlug, getBookFacets, getBooks, getCategory } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { breadcrumbJsonLd, serializeJsonLd, stripHtml } from "@/lib/jsonld";
import { itemListJsonLd } from "@/lib/jsonld-discovery";
import { PAGE_SIZE, clearFilters, hrefFor, isFiltered, parseBookQuery } from "@/lib/discovery";
import { toPersianDigits } from "@/lib/format";
import type { BookFacets, BookQuery, CategoryDetail } from "@/lib/types";
import { Breadcrumb, type Crumb } from "@/components/product/Breadcrumb";
import { DiscoveryResults } from "@/components/discovery/DiscoveryResults";
import { DiscoveryResultsSkeleton } from "@/components/discovery/DiscoverySkeleton";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const loadCategory = cache(async (rawSlug: string) => getCategory(decodeSlug(rawSlug)));

function describe(category: CategoryDetail): string {
  const text = stripHtml(category.description);
  if (text) return text.slice(0, 160);
  return `خرید کتاب‌های ${category.name} برای آزمون وکالت، قضاوت و ارشد در ${SITE_NAME}؛ نسخه چاپی و الکترونیک با فیلتر درس، آزمون و قیمت.`;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();
  const query = parseBookQuery(await searchParams);
  const page = query.page ?? 1;
  const path = routes.category(category.slug);
  const canonical = page > 1 ? `${path}?page=${page}` : path;
  const title = page > 1 ? `${category.name} — صفحه ${toPersianDigits(page)}` : `کتاب‌های ${category.name}`;
  const description = describe(category);
  return {
    title,
    description,
    alternates: { canonical },
    // filtered/searched variants are thin duplicates: keep them out of the index but let links be followed
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
    openGraph: { type: "website", locale: "fa_IR", title, description, url: canonical },
  };
}

async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const category = await loadCategory(slug);
  // No route-level loading.tsx here: it would commit a 200 status before notFound() could send 404.
  if (!category) notFound();

  const query = parseBookQuery(await searchParams);
  const basePath = routes.category(category.slug);
  const base = siteUrl();
  const crumbs: Crumb[] = [
    { name: "خانه", href: routes.home },
    ...(category.parent ? [{ name: category.parent.name, href: routes.category(category.parent.slug) }] : []),
    { name: category.name },
  ];
  const breadcrumbLd = breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${base}${c.href ?? basePath}` })));
  const description = stripHtml(category.description);

  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-2 md:pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }} />
      <Breadcrumb items={crumbs} />

      <header className="mt-1">
        <h1 className="text-xl font-black text-ink md:text-2xl">{category.name}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-muted md:text-base">{description}</p>}
      </header>

      {category.children.length > 0 && (
        <nav aria-label={`زیردسته‌های ${category.name}`} className="mt-3">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {category.children.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={routes.category(c.slug)}
                  className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:border-primary hover:bg-primary-soft"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <Suspense key={hrefFor(basePath, query)} fallback={<DiscoveryResultsSkeleton />}>
        <CategoryResults category={category} query={query} basePath={basePath} />
      </Suspense>
    </div>
  );
}

async function CategoryResults({ category, query, basePath }: { category: CategoryDetail; query: BookQuery; basePath: string }) {
  const apiQuery: BookQuery = { ...query, category: category.slug, page_size: PAGE_SIZE };
  const [results, facets] = await Promise.all([getBooks(apiQuery), optional<BookFacets | null>(getBookFacets(apiQuery), null)]);
  const base = siteUrl();
  const itemListLd = itemListJsonLd(results.results, {
    name: `کتاب‌های ${category.name}`,
    url: `${base}${basePath}`,
    productUrl: (s) => `${base}${routes.product(s)}`,
    offset: ((query.page ?? 1) - 1) * PAGE_SIZE,
  });
  const filtered = isFiltered(query);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListLd) }} />
      <DiscoveryResults
        basePath={basePath}
        query={query}
        results={results}
        facets={facets}
        empty={
          <div className="rounded-card bg-surface p-6 text-center shadow-card">
            <p className="text-base font-bold text-ink">
              {filtered ? "با این فیلترها کتابی پیدا نشد." : "هنوز کتابی در این دسته‌بندی نیست."}
            </p>
            {filtered && (
              <Link
                href={hrefFor(basePath, clearFilters(query))}
                className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"
              >
                حذف همه فیلترها
              </Link>
            )}
          </div>
        }
      />
    </>
  );
}
