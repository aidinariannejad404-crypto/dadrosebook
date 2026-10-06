import { slugSegment } from "./api";
import { apiFetch, errorMessage } from "./session";
import { EPUB_FIXTURE, EPUB_FIXTURE_SLUG } from "./reader-fixture-epub";
import { errorFromResponse, libraryCall, readerFixtureEnabled, type ReaderError, type ReaderResult } from "./reader";
import type { EpubChapter, ProblemKind, ProblemReport, ProblemReportBody, SampleSession } from "./types";

/**
 * Reader stream clients: د۵ free sample (no login), ه۸ «گزارش مشکل», ه۶ «دریافت رایگان».
 * Same-origin `/api/v1/library/…` like the rest of the reader; fixtures under NEXT_PUBLIC_READER_FIXTURE=1.
 */

/* ---------- د۵ sample ---------- */

/** `/read/<slug>?sample=1` */
export function sampleHref(slug: string): string {
  return `/read/${encodeURIComponent(slug)}?sample=1`;
}

/** Pages shown vs the whole book, for the sample chrome («نمونه: ۳ از ۲۸ صفحه»). */
export function sampleShare(sample: Pick<SampleSession, "sample_pages" | "total_pages">): number {
  if (!sample.total_pages) return 0;
  return Math.min(100, Math.round((sample.sample_pages / sample.total_pages) * 100));
}

/** Checkout link for one variant (quick buy, Phase 3 `/checkout?variant=<id>`). */
export function buyHref(variantId: number): string {
  return `/checkout?variant=${variantId}`;
}

const FIXTURE_SAMPLE_CHAPTERS = 2;

function fixtureSample(slug: string): SampleSession {
  const epub = slug === EPUB_FIXTURE_SLUG;
  const chapters = EPUB_FIXTURE.info.chapters.slice(0, FIXTURE_SAMPLE_CHAPTERS);
  return {
    book: {
      slug,
      title: epub ? "قانون مدنی در نظم کنونی" : "نمونه کتاب الکترونیک",
      subtitle: "",
      cover: null,
      authors: epub ? ["گروه مؤلفان دادرُز"] : ["دادرُز"],
      subjects: [],
    },
    format: epub ? "EPUB" : "PDF",
    version: 1,
    watermark: "نمونه رایگان",
    sample_pages: epub ? chapters.reduce((n, c) => n + c.pages, 0) : 2,
    total_pages: epub ? EPUB_FIXTURE.info.total_pages : 6,
    file_url: epub ? "" : "/fixtures/reader-sample.pdf",
    epub: epub
      ? {
          ...EPUB_FIXTURE.info,
          total_pages: chapters.reduce((n, c) => n + c.pages, 0),
          chapters,
          toc: EPUB_FIXTURE.info.toc.filter((t) => t.chapter < FIXTURE_SAMPLE_CHAPTERS),
        }
      : null,
    offers: [
      { id: 101, type: "EBOOK", label: "نسخه الکترونیک", price: 185_000, in_stock: true },
      { id: 102, type: "BUNDLE", label: "چاپی + الکترونیک", price: 420_000, in_stock: true },
    ],
    owned: false,
  };
}

async function publicCall<T>(path: string): Promise<ReaderResult<T>> {
  const res = await apiFetch<T>(`/library${path}`);
  if (res.ok) return { ok: true, data: res.data };
  if (res.status === 0) return { ok: false, error: { kind: "network" } };
  return { ok: false, error: errorFromResponse(res.status, res.error) };
}

/** GET /library/<slug>/sample/ — anyone (rate-limited by IP). 404 → no sample for this book. */
export function getSampleSession(slug: string): Promise<ReaderResult<SampleSession>> {
  if (readerFixtureEnabled()) return Promise.resolve({ ok: true, data: fixtureSample(slug) });
  return publicCall<SampleSession>(`/${slugSegment(slug)}/sample/`);
}

/** GET /library/<slug>/sample/chapters/<n>/ — only chapters inside the sample (the last one is cut). */
export function getSampleChapter(slug: string, index: number): Promise<ReaderResult<EpubChapter>> {
  if (readerFixtureEnabled()) {
    const ch = EPUB_FIXTURE.chapters[index];
    if (!ch || index >= FIXTURE_SAMPLE_CHAPTERS) return Promise.resolve({ ok: false, error: { kind: "no_ebook" } });
    const last = index === FIXTURE_SAMPLE_CHAPTERS - 1;
    return Promise.resolve({ ok: true, data: { ...ch, next: last ? null : ch.next, sample_end: last } });
  }
  return publicCall<EpubChapter>(`/${slugSegment(slug)}/sample/chapters/${index}/`);
}

/* ---------- ه۸ problem reports ---------- */

export const PROBLEM_KINDS: { value: ProblemKind; label: string }[] = [
  { value: "typo", label: "غلط تایپی یا محتوایی" },
  { value: "missing_page", label: "صفحه یا بخش ناقص" },
  { value: "display", label: "مشکل نمایش" },
  { value: "other", label: "سایر" },
];

export const PROBLEM_DESCRIPTION_MAX = 2000;

/** Owner decision pending: the promised response time shown under the form. */
export const SUPPORT_SLA_TEXT = "تیم پشتیبانی معمولاً ظرف یک روز کاری بررسی می‌کند.";

/** Client-side check (the server checks the same): «سایر» needs a description. */
export function problemFormError(kind: ProblemKind | null, description: string): string | null {
  if (!kind) return "نوع مشکل را انتخاب کنید.";
  if (kind === "other" && !description.trim()) return "مشکل را کوتاه توضیح دهید.";
  if (description.length > PROBLEM_DESCRIPTION_MAX) return "توضیح بیش از حد طولانی است.";
  return null;
}

/** Short device label sent with a report («Chrome · Android»). */
export function deviceLabel(ua: string): string {
  const browser =
    [
      ["SamsungBrowser", "Samsung Internet"],
      ["Edg/", "Edge"],
      ["OPR/", "Opera"],
      ["Firefox/", "Firefox"],
      ["CriOS", "Chrome"],
      ["Chrome/", "Chrome"],
      ["Safari/", "Safari"],
    ].find(([token]) => ua.includes(token!))?.[1] ?? "مرورگر";
  const system =
    [
      ["Android", "Android"],
      ["iPhone", "iPhone"],
      ["iPad", "iPad"],
      ["Windows", "Windows"],
      ["Mac OS X", "macOS"],
      ["Linux", "Linux"],
    ].find(([token]) => ua.includes(token!))?.[1] ?? "";
  return system ? `${browser} · ${system}` : browser;
}

let fixtureReportId = 1;

/** POST /library/<slug>/problems/ */
export function reportProblem(slug: string, body: ProblemReportBody): Promise<ReaderResult<ProblemReport>> {
  const clean: ProblemReportBody = {
    ...body,
    description: (body.description ?? "").slice(0, PROBLEM_DESCRIPTION_MAX),
    location: (body.location ?? "").slice(0, 100),
    chapter_title: (body.chapter_title ?? "").slice(0, 300),
    device_label: (body.device_label ?? "").slice(0, 100),
  };
  if (readerFixtureEnabled()) {
    return new Promise((resolve) =>
      setTimeout(
        () => resolve({ ok: true, data: { ...clean, id: fixtureReportId++, status: "new", created_at: new Date().toISOString() } }),
        150,
      ),
    );
  }
  return libraryCall<ProblemReport>(`/${slugSegment(slug)}/problems/`, { method: "POST", body: JSON.stringify(clean) });
}

/* ---------- ه۶ free ebooks ---------- */

export type ClaimResult = { ok: true; created: boolean } | { ok: false; error: ReaderError | { kind: "not_free"; message: string } };

/** POST /library/<slug>/claim-free/ (401 → the caller sends the visitor to /login). */
export async function claimFreeEbook(slug: string): Promise<ClaimResult> {
  if (readerFixtureEnabled()) return { ok: true, created: true };
  const res = await apiFetch<{ created: boolean }>(`/library/${slugSegment(slug)}/claim-free/`, { method: "POST" });
  if (res.ok) return { ok: true, created: res.data.created };
  if (res.status === 0) return { ok: false, error: { kind: "network" } };
  if (res.status === 400) {
    return { ok: false, error: { kind: "not_free", message: errorMessage(res.error, undefined, "این کتاب رایگان نیست.") } };
  }
  return { ok: false, error: errorFromResponse(res.status, res.error) };
}
