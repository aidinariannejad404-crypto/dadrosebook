import type { BookCard, BookDetail, CategoryNode, ExamEvent, HomePayload } from "./types";

/**
 * API client for /api/v1/.
 * - Server (RSC): API_INTERNAL_URL (e.g. http://backend:8000/api/v1 inside docker).
 * - Browser: NEXT_PUBLIC_API_URL (e.g. http://localhost:8000/api/v1).
 * - USE_API_FIXTURES=1 (local dev/tests only): serve src/lib/__fixtures__ instead of calling the API.
 */

export const REVALIDATE_SECONDS = 60;

const DEFAULT_API = "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`API ${status} for ${url}`);
    this.name = "ApiError";
  }
}

export function fixturesEnabled(): boolean {
  return process.env.USE_API_FIXTURES === "1";
}

export function apiBase(): string {
  const base =
    typeof window === "undefined"
      ? process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || DEFAULT_API
      : process.env.NEXT_PUBLIC_API_URL || DEFAULT_API;
  return base.replace(/\/+$/, "");
}

/** Slugs are Unicode Persian; always encode them as one path segment. */
export function slugSegment(slug: string): string {
  return encodeURIComponent(slug);
}

/** Next.js hands dynamic route params URL-encoded; decode once, tolerating already-decoded input. */
export function decodeSlug(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as T;
}

/* ---------- fixtures (dynamic imports keep them out of real-mode bundles) ---------- */

async function fixtureHome(): Promise<HomePayload> {
  return (await import("./__fixtures__/home.json")).default as unknown as HomePayload;
}
async function fixtureBooks(): Promise<BookDetail[]> {
  return (await import("./__fixtures__/books.json")).default as unknown as BookDetail[];
}
async function fixtureRelated(): Promise<Record<string, BookCard[]>> {
  return (await import("./__fixtures__/related.json")).default as unknown as Record<string, BookCard[]>;
}
async function fixtureExamEvents(): Promise<ExamEvent[]> {
  return (await import("./__fixtures__/exam-events.json")).default as unknown as ExamEvent[];
}

/* ---------- public API ---------- */

export async function getHome(): Promise<HomePayload> {
  if (fixturesEnabled()) return fixtureHome();
  return apiGet<HomePayload>("/catalog/home/");
}

/** Book detail, or null when the API answers 404 (unknown/inactive slug). */
export async function getBook(slug: string): Promise<BookDetail | null> {
  if (fixturesEnabled()) {
    return (await fixtureBooks()).find((b) => b.slug === slug) ?? null;
  }
  try {
    return await apiGet<BookDetail>(`/catalog/books/${slugSegment(slug)}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getRelatedBooks(slug: string): Promise<BookCard[]> {
  if (fixturesEnabled()) return (await fixtureRelated())[slug] ?? [];
  try {
    return await apiGet<BookCard[]>(`/catalog/books/${slugSegment(slug)}/related/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

export async function getCategories(): Promise<CategoryNode[]> {
  if (fixturesEnabled()) return (await fixtureHome()).categories;
  return apiGet<CategoryNode[]>("/catalog/categories/");
}

export async function getExamEvents(): Promise<ExamEvent[]> {
  if (fixturesEnabled()) return fixtureExamEvents();
  return apiGet<ExamEvent[]>("/catalog/exam-events/");
}
