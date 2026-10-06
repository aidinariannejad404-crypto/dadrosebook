import type { BookCard, GuideDetail, PersonProfile } from "./types";
import { SITE_NAME, routes } from "./config";
import { stripHtml } from "./jsonld";

/**
 * schema.org for hub pages (package ب; docs: appendix seo-google.md §5 «Schema coverage target»):
 * hubs → CollectionPage (+ ItemList of the books), authors → ProfilePage › Person,
 * guides → Article with author → Person page. BreadcrumbList comes from `breadcrumbJsonLd`.
 */

type Json = Record<string, unknown>;

function clean(data: Json): Json {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== "" && v !== null));
}

function itemList(site: string, books: Pick<BookCard, "title" | "slug">[]): Json | undefined {
  if (!books.length) return undefined;
  return {
    "@type": "ItemList",
    numberOfItems: books.length,
    itemListElement: books.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site}${routes.product(b.slug)}`,
      name: b.title,
    })),
  };
}

export function collectionPageJsonLd({
  site,
  path,
  name,
  description,
  books,
  dateModified,
}: {
  site: string;
  path: string;
  name: string;
  description: string;
  books: Pick<BookCard, "title" | "slug">[];
  dateModified?: string;
}): Json {
  const url = `${site}${path}`;
  return clean({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    url,
    name,
    description,
    inLanguage: "fa",
    isPartOf: { "@id": `${site}/#website` },
    dateModified,
    mainEntity: itemList(site, books),
  });
}

/** Person node for author/reviewer references (Article.author, ProfilePage.mainEntity). */
export function personNode(site: string, person: PersonProfile, extra: Json = {}): Json {
  const url = `${site}${routes.author(person.slug)}`;
  return clean({
    "@type": "Person",
    "@id": `${url}#person`,
    name: person.name,
    url,
    jobTitle: person.job_title || undefined,
    affiliation: person.affiliation ? { "@type": "Organization", name: person.affiliation } : undefined,
    image: person.photo ?? undefined,
    ...extra,
  });
}

export function profilePageJsonLd({
  site,
  person,
  bio,
  sameAs,
  dateModified,
  books,
}: {
  site: string;
  person: PersonProfile;
  bio: string;
  sameAs: string[];
  dateModified?: string;
  books: Pick<BookCard, "title" | "slug">[];
}): Json {
  const url = `${site}${routes.author(person.slug)}`;
  return clean({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#page`,
    url,
    inLanguage: "fa",
    dateModified,
    mainEntity: personNode(site, person, {
      description: stripHtml(bio).slice(0, 500) || undefined,
      sameAs: sameAs.length ? sameAs : undefined,
      // the books they wrote/translated, as Book references to the product pages
      workExample: books.length
        ? books.slice(0, 20).map((b) => ({ "@type": "Book", name: b.title, url: `${site}${routes.product(b.slug)}` }))
        : undefined,
    }),
  });
}

export function articleJsonLd(site: string, guide: GuideDetail): Json {
  const url = `${site}${routes.guide(guide.slug)}`;
  const modified = guide.updated_on ?? guide.updated_at;
  const about = [...guide.exam_types.map((e) => e.name), ...guide.subjects.map((s) => s.name)];
  return clean({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: guide.title,
    description: guide.summary || stripHtml(guide.intro).slice(0, 300) || undefined,
    url,
    mainEntityOfPage: url,
    inLanguage: "fa",
    datePublished: guide.published_at ?? undefined,
    dateModified: modified,
    author: guide.author ? personNode(site, guide.author) : { "@type": "Organization", name: SITE_NAME },
    // the legal reviewer; schema.org has no Article.reviewedBy, `editor` is the closest property
    editor: guide.reviewer ? personNode(site, guide.reviewer) : undefined,
    publisher: { "@type": "Organization", "@id": `${site}/#organization`, name: SITE_NAME },
    about: about.length ? about : undefined,
  });
}
