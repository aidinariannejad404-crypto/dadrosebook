import type { Metadata } from "next";
import type { GuideCard, PersonProfile } from "./types";
import { INDEX, NOINDEX_FOLLOW } from "./seo";
import { stripHtml } from "./jsonld";
import { formatJalaliDate } from "./format";

/**
 * Hub pages (package ب): exam, subject, author, publisher, guide and list pages.
 *
 * Indexability guardrail (ب۷): the backend decides (`indexable`, see
 * backend/apps/content/services/indexing.py — intro ≥ HUB_INDEX_MIN_INTRO_WORDS words and ≥ 3 books
 * for exam/subject/list hubs, bio or ≥ 2 books for authors, ≥ 3 books for publishers). The page
 * only maps that verdict to robots: thin hubs stay reachable and keep passing link equity
 * (`noindex, follow`) and the sitemap leaves them out.
 */
export function hubRobots(indexable: boolean | null | undefined): NonNullable<Metadata["robots"]> {
  return indexable === true ? INDEX : NOINDEX_FOLLOW;
}

/** A guide is indexable only when published and the server says so; previews never are. */
export function guideRobots(guide: { is_published: boolean; indexable: boolean }): NonNullable<Metadata["robots"]> {
  return hubRobots(guide.is_published && guide.indexable);
}

/** An expired curated list stays shareable but is never indexed. */
export function listRobots(list: { is_expired: boolean; indexable: boolean }): NonNullable<Metadata["robots"]> {
  return hubRobots(!list.is_expired && list.indexable);
}

/** Meta description: the intro's text cut at a word boundary (≤ max chars), else the fallback. */
export function metaDescription(html: string | null | undefined, fallback: string, max = 160): string {
  const text = stripHtml(html ?? "");
  if (!text) return fallback;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** «عضو هیئت علمی، دانشگاه تهران» — job title and affiliation, whichever exist. */
export function credentialLine(person: Pick<PersonProfile, "job_title" | "affiliation"> | null | undefined): string {
  if (!person) return "";
  return [person.job_title, person.affiliation].map((s) => s.trim()).filter(Boolean).join("، ");
}

export interface BylinePart {
  label: "نوشته" | "بازبینی";
  person: PersonProfile;
}

/** «نوشته … · بازبینی …» parts of a guide byline (author first; missing people are skipped). */
export function guideByline(guide: Pick<GuideCard, "author" | "reviewer">): BylinePart[] {
  const parts: BylinePart[] = [];
  if (guide.author) parts.push({ label: "نوشته", person: guide.author });
  if (guide.reviewer) parts.push({ label: "بازبینی", person: guide.reviewer });
  return parts;
}

/** The byline as plain text, e.g. «نوشته دکتر الف · بازبینی دکتر ب». */
export function guideBylineText(guide: Pick<GuideCard, "author" | "reviewer">): string {
  return guideByline(guide)
    .map((p) => `${p.label} ${p.person.name}`)
    .join(" · ");
}

/** «به‌روزشده در ۱۰ مهر ۱۴۰۵» from an ISO date/datetime; "" when missing or invalid. */
export function updatedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return `به‌روزشده در ${formatJalaliDate(date)}`;
}

/** Role of a person on their page: نویسنده، مترجم or both. */
export function personRole(authored: number, translated: number): string {
  if (authored && translated) return "نویسنده و مترجم";
  return translated ? "مترجم" : "نویسنده";
}
