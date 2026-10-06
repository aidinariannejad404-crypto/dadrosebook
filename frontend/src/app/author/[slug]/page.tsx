import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getAuthorHub } from "@/lib/api";
import { SITE_NAME, routes, siteUrl } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { credentialLine, hubRobots, metaDescription, personRole } from "@/lib/hubs";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { profilePageJsonLd } from "@/lib/jsonld-hubs";
import type { AuthorHub } from "@/lib/types";
import { BookGrid, ChipLinks, GuideList, HubHeader, HubSection, HubShell, JsonLd } from "@/components/hub/HubParts";
import { ExternalIcon, UserIcon } from "@/components/ui/Icons";

type Params = Promise<{ slug: string }>;

const loadHub = cache(async (rawSlug: string) => getAuthorHub(decodeSlug(rawSlug)));

function role(hub: AuthorHub): string {
  return personRole(hub.authored.length, hub.translated.length);
}

const title = (hub: AuthorHub) => `کتاب‌های ${hub.person.name}`;

function fallbackDescription(hub: AuthorHub): string {
  const cred = credentialLine(hub.person);
  return `${hub.person.name}${cred ? `، ${cred}` : ""}؛ ${role(hub)} ${toPersianDigits(hub.book_count)} کتاب حقوقی در ${SITE_NAME}. همه کتاب‌ها با نسخه چاپی و الکترونیک.`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const hub = await loadHub((await params).slug);
  if (!hub) return { title: "نویسنده پیدا نشد" };
  const path = routes.author(hub.person.slug);
  const description = metaDescription(hub.person.bio, fallbackDescription(hub));
  return {
    title: title(hub),
    description,
    alternates: { canonical: path },
    robots: hubRobots(hub.indexable),
    openGraph: {
      type: "profile",
      locale: "fa_IR",
      siteName: SITE_NAME,
      title: title(hub),
      description,
      url: path,
      images: hub.person.photo ? [{ url: hub.person.photo, alt: hub.person.name }] : undefined,
    },
  };
}

export default async function AuthorPage({ params }: { params: Params }) {
  const hub = await loadHub((await params).slug);
  if (!hub) notFound();

  const site = siteUrl();
  const path = routes.author(hub.person.slug);
  const crumbs = [{ name: "خانه", href: routes.home }, { name: hub.person.name }];
  const jsonLd = [
    profilePageJsonLd({
      site,
      person: hub.person,
      bio: hub.person.bio,
      sameAs: hub.same_as,
      dateModified: hub.updated_at,
      books: [...hub.authored, ...hub.translated],
    }),
    breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${site}${c.href ?? path}` }))),
  ];
  const cred = credentialLine(hub.person);
  const bioParagraphs = hub.person.bio
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const guides = [...hub.guides_written, ...hub.guides_reviewed.filter((g) => !hub.guides_written.some((w) => w.id === g.id))];

  return (
    <HubShell crumbs={crumbs}>
      <JsonLd data={jsonLd} />
      <div className="mt-1 flex items-start gap-4">
        <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary md:size-28">
          {hub.person.photo ? (
            <Image src={hub.person.photo} alt={`عکس ${hub.person.name}`} fill sizes="112px" className="object-cover" />
          ) : (
            <UserIcon size={40} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <HubHeader
            eyebrow={role(hub)}
            title={hub.person.name}
            subtitle={
              <>
                {cred && <span className="block font-bold text-ink">{cred}</span>}
                <span className="block">{toPersianDigits(hub.book_count)} کتاب در فروشگاه</span>
              </>
            }
          />
        </div>
      </div>

      {(bioParagraphs.length > 0 || hub.same_as.length > 0) && (
        <section aria-labelledby="bio-title" className="mt-5 max-w-3xl rounded-card bg-surface p-4 shadow-card md:p-6">
          <h2 id="bio-title" className="text-base font-extrabold text-ink">
            درباره {hub.person.name}
          </h2>
          {bioParagraphs.map((p, i) => (
            <p key={i} className="mt-2 leading-8 text-ink">
              {p}
            </p>
          ))}
          {hub.same_as.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4">
              {hub.same_as.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary hover:underline">
                    <bdi dir="ltr">{new URL(url).hostname.replace(/^www\./, "")}</bdi>
                    <ExternalIcon size={14} />
                    <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {hub.subjects.length > 0 && (
        <nav aria-label="درس‌ها" className="mt-5">
          <ChipLinks
            label="درس‌ها"
            items={hub.subjects.map((s) => ({ key: s.id, href: routes.subject(s.slug), text: s.name, color: s.color }))}
          />
        </nav>
      )}

      {hub.authored.length > 0 && (
        <HubSection id="authored-title" title={`تألیفات ${hub.person.name}`}>
          <BookGrid books={hub.authored} labelledBy="authored-title" />
        </HubSection>
      )}
      {hub.translated.length > 0 && (
        <HubSection id="translated-title" title={`ترجمه‌های ${hub.person.name}`}>
          <BookGrid books={hub.translated} labelledBy="translated-title" />
        </HubSection>
      )}
      {guides.length > 0 && (
        <HubSection id="guides-title" title="راهنماهای نوشته یا بازبینی‌شده">
          <GuideList guides={guides} />
        </HubSection>
      )}
    </HubShell>
  );
}
