import type { Metadata } from "next";
import { decodeSlug } from "@/lib/api";
import { Reader } from "@/components/reader/Reader";

type Params = Promise<{ slug: string }>;

/** Readable title from the slug (no catalog fetch: the reader is client-driven and private). */
function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `مطالعه ${titleFromSlug(decodeSlug(slug))}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

/**
 * Secure ebook reader (Phase 4). Everything personal (session, signed file URL, progress,
 * highlights) is fetched by the browser with the auth cookie; the server renders only the shell.
 */
export default async function ReadPage({ params }: { params: Params }) {
  const { slug } = await params;
  return <Reader slug={decodeSlug(slug)} />;
}
