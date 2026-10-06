import Link from "next/link";
import type { ReactNode } from "react";
import type { BookCard as BookCardData, Course, GuideCard, PersonProfile } from "@/lib/types";
import { routes } from "@/lib/config";
import { credentialLine, guideByline, updatedLabel } from "@/lib/hubs";
import { serializeJsonLd } from "@/lib/jsonld";
import { BookCard } from "@/components/book/BookCard";
import { CourseCard } from "@/components/course/CourseCard";
import { Breadcrumb, type Crumb } from "@/components/product/Breadcrumb";
import { CollapsibleText } from "@/components/product/CollapsibleText";
import { SectionHeader } from "@/components/ui/SectionHeader";

/** Shared building blocks of the hub pages (package ب). Server components. */

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function HubShell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-2 md:pt-4">
      <Breadcrumb items={crumbs} />
      {children}
    </div>
  );
}

/** H1 block: eyebrow (e.g. «منابع آزمون»), title, optional subtitle and side content (countdown). */
export function HubHeader({
  eyebrow,
  title,
  subtitle,
  aside,
  accent,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  /** subject colour for the side bar */
  accent?: string;
}) {
  return (
    <header className="mt-1 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 border-s-4 ps-3" style={{ borderColor: accent ?? "var(--color-accent)" }}>
        {eyebrow && <p className="text-sm font-bold text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-black leading-10 text-ink md:text-3xl md:leading-[3rem]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm leading-7 text-ink-muted md:text-base">{subtitle}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/** Editorial intro (sanitised HTML from the admin) with its «تهیه‌شده توسط … · به‌روزشده در …» line. */
export function HubIntro({ html, byline, updatedAt }: { html: string; byline?: string; updatedAt?: string | null }) {
  if (!html.trim()) return null;
  const updated = updatedLabel(updatedAt);
  return (
    <section aria-label="معرفی" className="mt-5 max-w-3xl rounded-card bg-surface p-4 shadow-card md:p-6">
      {/* full text stays in the server HTML (it is what makes the hub indexable); the island only clips it */}
      <CollapsibleText collapsedRem={12}>
        <div className="rich-text text-[0.9375rem]" dangerouslySetInnerHTML={{ __html: html }} />
      </CollapsibleText>
      {(byline || updated) && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
          {[byline ? `تهیه‌شده توسط ${byline}` : "", updated].filter(Boolean).join(" · ")}
        </p>
      )}
    </section>
  );
}

/** Responsive grid of book cards (2 columns at 360px). */
export function BookGrid({ books, labelledBy }: { books: BookCardData[]; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
      {books.map((b) => (
        <li key={b.id}>
          <BookCard book={b} />
        </li>
      ))}
    </ul>
  );
}

export function HubSection({
  id,
  title,
  subtitle,
  href,
  linkLabel,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <SectionHeader id={id} title={title} subtitle={subtitle} href={href} linkLabel={linkLabel} />
      {children}
    </section>
  );
}

export function CourseGrid({ courses, placement }: { courses: Course[]; placement: string }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <li key={c.id}>
          <CourseCard course={c} utmContent={placement} book={null} tier={placement} />
        </li>
      ))}
    </ul>
  );
}

/** Person name linked to their page, with credentials in a muted line. */
export function PersonLink({ person, className = "" }: { person: PersonProfile; className?: string }) {
  return (
    <Link prefetch={false} href={routes.author(person.slug)} className={`font-bold text-primary underline-offset-4 hover:underline ${className}`}>
      {person.name}
    </Link>
  );
}

/** «نوشته … · بازبینی …» with links to the people's pages. */
export function GuideBylineLine({ guide, className = "" }: { guide: Pick<GuideCard, "author" | "reviewer">; className?: string }) {
  const parts = guideByline(guide);
  if (!parts.length) return null;
  return (
    <p className={`text-sm text-ink-muted ${className}`}>
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {p.label} <PersonLink person={p.person} />
          {credentialLine(p.person) && <span> ({credentialLine(p.person)})</span>}
        </span>
      ))}
    </p>
  );
}

export function GuideList({ guides }: { guides: GuideCard[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {guides.map((g) => (
        <li key={g.id} className="rounded-card bg-surface p-4 shadow-card">
          <h3 className="text-base font-extrabold leading-7">
            <Link prefetch={false} href={routes.guide(g.slug)} className="text-ink hover:text-primary hover:underline">
              {g.title}
            </Link>
          </h3>
          {g.summary && <p className="mt-1 text-sm leading-7 text-ink-muted">{g.summary}</p>}
          <GuideBylineLine guide={g} className="mt-2 text-xs" />
          {g.updated_on && <p className="mt-1 text-xs text-ink-muted">{updatedLabel(g.updated_on)}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Chip links (subjects, exams, authors) — 44px targets. */
export function ChipLinks({ items, label }: { items: { key: string | number; href: string; text: string; color?: string }[]; label: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((it) => (
        <li key={it.key}>
          <Link
            prefetch={false}
            href={it.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:border-primary hover:bg-primary-soft"
          >
            {it.color && <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: it.color }} />}
            {it.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}
