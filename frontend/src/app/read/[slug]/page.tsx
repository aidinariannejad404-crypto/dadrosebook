import type { Metadata } from "next";
import { decodeSlug } from "@/lib/api";
import { Reader } from "@/components/reader/Reader";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ sample?: string | string[] }>;

/** د۵: `/read/<slug>?sample=1` opens the free sample (no login). */
function isSample(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

/** Readable title from the slug (no catalog fetch: the reader is client-driven and private). */
function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { slug } = await params;
  const sample = isSample((await searchParams).sample);
  return {
    title: `${sample ? "نمونه رایگان" : "مطالعه"} ${titleFromSlug(decodeSlug(slug))}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

/**
 * Secure ebook reader (Phase 4). Everything personal (session, signed file URL, progress,
 * highlights) is fetched by the browser with the auth cookie; the server renders only the shell.
 */
export default async function ReadPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sample = isSample((await searchParams).sample);
  return <Reader key={sample ? "sample" : "full"} slug={decodeSlug(slug)} sample={sample} />;
}
