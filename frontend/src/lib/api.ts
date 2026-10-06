import type {
  // hubs (package ب)
  AuthorHub,
  CuratedListDetail,
  ExamHub,
  GuideDetail,
  PublisherHub,
  SubjectHub,
  BookCard,
  BookDetail,
  BookFacets,
  BookQuery,
  CategoryDetail,
  CategoryNode,
  Course,
  CourseType,
  ExamEvent,
  ExamTypeMini,
  HomePayload,
  KitRole,
  Paginated,
  SearchSuggestions,
  SitemapData,
  StoreSettings,
  StudyPlan,
  StudyPlanCreated,
  StudyPlanRequest,
  StudyKit,
  SubjectWithCount,
} from "./types";
import { fixtureStudyPlan, studyPlanErrors, type StudyPlanField } from "./study-plan";
import type { CampaignDetail, CampaignSummary, Gift, SharedKit } from "./growth"; // growth

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

/** "?a=1&b=2" from the defined values, "" when none. */
export function queryString(params: Record<string, string | null | undefined | false>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const out = qs.toString();
  return out ? `?${out}` : "";
}

async function apiGet<T>(path: string, revalidate: number = REVALIDATE_SECONDS): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate },
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
async function fixtureWeights(): Promise<Record<string, Record<string, number>>> {
  return (await import("./__fixtures__/exam-weights.json")).default as Record<string, Record<string, number>>;
}

/** Fixture stand-in for the backend's `?exam_type=` handling: kit_role and the «ضروری کیت» badge. */
async function fixtureWithExam<T extends BookCard>(card: T, exam: string | null): Promise<T> {
  if (!exam) return card;
  const detail = (await fixtureBooks()).find((b) => b.id === card.id);
  const placement = detail?.kit_placements.find((k) => k.exam_type.slug === exam);
  const kit_role: KitRole | null = placement ? (placement.is_essential ? "essential" : "optional") : null;
  const badges = card.badges.filter((b) => b.code !== "kit_essential");
  if (kit_role === "essential") {
    const at = badges[0]?.code === "edition" ? 1 : 0;
    badges.splice(at, 0, { code: "kit_essential", label: "ضروری کیت", tone: "success" });
  }
  return { ...card, kit_role, badges: badges.slice(0, 2) };
}

async function fixtureHomeFor(exam: string | null): Promise<HomePayload> {
  const home = await fixtureHome();
  const selected = exam ? (home.exam_types.find((e) => e.slug === exam) ?? null) : null;
  if (!selected) return home;
  const slug = selected.slug;
  const fits = (b: BookCard) => b.exam_types.some((e) => e.slug === slug);
  const weights = (await fixtureWeights())[slug] ?? {};
  const events = await fixtureExamEvents();
  // weight desc, unweighted last, then the original (Subject.order) position — Array.sort is stable
  const subjects = home.subjects
    .map((s) => ({ ...s, weight: weights[s.slug] ?? null }))
    .sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1));
  return {
    ...home,
    selected_exam_type: selected,
    next_exam: events.find((e) => e.exam_type.slug === slug) ?? home.next_exam,
    subjects,
    bestsellers: await Promise.all(home.bestsellers.filter(fits).map((b) => fixtureWithExam(b, slug))),
    quick_review: await Promise.all(home.quick_review.filter(fits).map((b) => fixtureWithExam(b, slug))),
    discounted: await Promise.all((home.discounted ?? []).filter(fits).map((b) => fixtureWithExam(b, slug))),
  };
}

/* ---------- public API ---------- */

/** Home payload; `examType` (one slug, P1-3) filters the rails and fills kit_role / subject weights. */
export async function getHome(examType: string | null = null): Promise<HomePayload> {
  if (fixturesEnabled()) return fixtureHomeFor(examType);
  return apiGet<HomePayload>(`/catalog/home/${queryString({ exam_type: examType })}`);
}

/** Book detail, or null when the API answers 404 (unknown/inactive slug). `examType` fills kit_role. */
export async function getBook(slug: string, examType: string | null = null): Promise<BookDetail | null> {
  if (fixturesEnabled()) {
    const book = (await fixtureBooks()).find((b) => b.slug === slug);
    return book ? fixtureWithExam(book, examType) : null;
  }
  try {
    return await apiGet<BookDetail>(`/catalog/books/${slugSegment(slug)}/${queryString({ exam_type: examType })}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Related books; `inStock` keeps only books with an in-stock variant (alternatives for a sold-out book, P1-8). */
export async function getRelatedBooks(
  slug: string,
  { inStock = false, examType = null }: { inStock?: boolean; examType?: string | null } = {},
): Promise<BookCard[]> {
  if (fixturesEnabled()) {
    const cards = ((await fixtureRelated())[slug] ?? []).filter((b) => !inStock || b.in_stock);
    return Promise.all(cards.map((b) => fixtureWithExam(b, examType)));
  }
  try {
    const qs = queryString({ in_stock: inStock && "true", exam_type: examType });
    return await apiGet<BookCard[]>(`/catalog/books/${slugSegment(slug)}/related/${qs}`);
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

/** Active exam types (P1-2 exam-fit table). */
export async function getExamTypes(): Promise<ExamTypeMini[]> {
  if (fixturesEnabled()) return (await fixtureHome()).exam_types;
  return apiGet<ExamTypeMini[]>("/catalog/exam-types/");
}

/** Store settings singleton (P1-6, P1-12, P1-18). */
export async function getStoreSettings(): Promise<StoreSettings> {
  if (fixturesEnabled()) return (await fixtureHome()).store;
  return apiGet<StoreSettings>("/store/settings/");
}

/** Subjects with book counts (study-plan form choices). */
export async function getSubjects(): Promise<SubjectWithCount[]> {
  if (fixturesEnabled()) return (await fixtureHome()).subjects;
  return apiGet<SubjectWithCount[]>("/catalog/subjects/");
}

/** GET /seo/sitemap/ (Phase 5): slugs + updated_at for sitemap.xml; cached for an hour. */
export async function getSitemapData(): Promise<SitemapData> {
  if (fixturesEnabled()) return (await import("./__fixtures__/sitemap.json")).default as unknown as SitemapData;
  return apiGet<SitemapData>("/seo/sitemap/", 3600);
}

/* ---------- academy courses ---------- */

/** Every open course in the fixtures (course_offer parts and related courses), deduplicated by id. */
async function fixtureCourses(): Promise<Course[]> {
  const byId = new Map<number, Course>();
  for (const b of await fixtureBooks()) {
    const o = b.course_offer;
    const all = [
      ...(o ? [o.highlight, ...o.tiers, ...o.more, o.free_sample?.course] : []),
      ...b.related_courses,
    ];
    for (const c of all) {
      if (!c || byId.has(c.id)) continue;
      const course: Record<string, unknown> = { ...c };
      for (const k of ["relevance", "relevance_label", "tier", "is_recommended"]) delete course[k];
      byId.set(c.id, course as unknown as Course);
    }
  }
  return [...byId.values()];
}

/** GET /catalog/courses/ — open courses, filtered by subject / course type / exam type slugs. */
export async function getCourses(
  filters: { subject?: string | null; courseType?: CourseType | null; examType?: string | null } = {},
): Promise<Course[]> {
  if (fixturesEnabled()) {
    return (await fixtureCourses()).filter(
      (c) =>
        (!filters.subject || c.subject?.slug === filters.subject) &&
        (!filters.courseType || c.course_type === filters.courseType) &&
        (!filters.examType || c.exam_types.some((e) => e.slug === filters.examType)),
    );
  }
  const qs = queryString({ subject: filters.subject, course_type: filters.courseType, exam_type: filters.examType });
  return apiGet<Course[]>(`/catalog/courses/${qs}`);
}

/* ---------- study-plan lead magnet ---------- */

export type StudyPlanResult =
  | { ok: true; data: StudyPlanCreated }
  | { ok: false; errors: Partial<Record<StudyPlanField, string>> };

/**
 * POST /leads/study-plan/ from the browser (NEXT_PUBLIC_API_URL). `fixtures` is passed down by the
 * server component (USE_API_FIXTURES is not visible in the browser): it answers locally with a token.
 */
export async function submitStudyPlan(body: StudyPlanRequest, { fixtures = false } = {}): Promise<StudyPlanResult> {
  if (fixtures) {
    const token = globalThis.crypto?.randomUUID?.() ?? "8f1c2a4e-3b5d-4c6e-9f70-1a2b3c4d5e6f";
    return { ok: true, data: { token, plan_url: `/plan/${token}` } };
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/leads/study-plan/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, errors: { form: "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید." } };
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok && json && typeof json === "object" && "token" in json) {
    const data = json as StudyPlanCreated;
    return { ok: true, data: { token: data.token, plan_url: data.plan_url || `/plan/${data.token}` } };
  }
  return { ok: false, errors: studyPlanErrors(res.status, json) };
}

/** GET /leads/study-plan/<token>/ (personal: never cached), or null on 404. */
export async function getStudyPlan(token: string): Promise<StudyPlan | null> {
  if (fixturesEnabled()) {
    const now = Date.now();
    const books = (await fixtureBooks()).filter((b) => b.subjects[0]?.slug === "حقوق-مدنی" || b.id === 14);
    const exam = (await fixtureExamEvents())[0] ?? null;
    const courses = (await fixtureCourses()).filter((c) => c.subject?.slug === "حقوق-مدنی");
    const order: CourseType[] = ["ESSENTIALS", "TIPS_TESTS", "REVIEW"];
    const recommended = order.flatMap((t) => courses.filter((c) => c.course_type === t).slice(0, 1));
    return fixtureStudyPlan(token, now, books, exam, recommended);
  }
  const url = `${apiBase()}/leads/study-plan/${slugSegment(token)}/`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as StudyPlan;
}

/* ---------- Phase 2: discovery (docs/api-contract-phase-2.md) ---------- */

/** Serialise a BookQuery for /catalog/books/ and /catalog/books/facets/ (arrays comma separated). */
export function bookQueryString(query: BookQuery, { facets = false } = {}): string {
  const qs = new URLSearchParams();
  const put = (k: string, v: string | number | boolean | string[] | undefined) => {
    if (v === undefined || v === false || v === "") return;
    if (Array.isArray(v)) {
      if (v.length) qs.set(k, v.join(","));
      return;
    }
    qs.set(k, String(v));
  };
  put("q", query.q?.trim());
  put("subject", query.subject);
  put("exam_type", query.exam_type);
  put("category", query.category);
  put("format", query.format);
  put("resource_type", query.resource_type);
  put("min_price", query.min_price);
  put("max_price", query.max_price);
  put("in_stock", query.in_stock);
  put("has_sample", query.has_sample);
  put("quick_review", query.quick_review);
  if (!facets) {
    put("ordering", query.ordering);
    if (query.page && query.page > 1) put("page", query.page);
    put("page_size", query.page_size);
  }
  const out = qs.toString();
  return out ? `?${out}` : "";
}

/** GET /catalog/books/ — paginated book cards for /category/<slug> and /search. */
export async function getBooks(query: BookQuery = {}): Promise<Paginated<BookCard>> {
  if (fixturesEnabled()) {
    const { fixtureBookList } = await import("./fixture-discovery");
    return fixtureBookList(await fixtureBooks(), query);
  }
  return apiGet<Paginated<BookCard>>(`/catalog/books/${bookQueryString(query)}`);
}

/** GET /catalog/books/facets/ — filter counts for the same query. */
export async function getBookFacets(query: BookQuery = {}): Promise<BookFacets> {
  if (fixturesEnabled()) {
    const { fixtureFacets } = await import("./fixture-discovery");
    return fixtureFacets(await fixtureBooks(), query);
  }
  return apiGet<BookFacets>(`/catalog/books/facets/${bookQueryString(query, { facets: true })}`);
}

/** GET /catalog/categories/<slug>/, or null on 404. */
export async function getCategory(slug: string): Promise<CategoryDetail | null> {
  if (fixturesEnabled()) {
    const walk = (nodes: CategoryNode[], parent: CategoryNode | null): CategoryDetail | null => {
      for (const n of nodes) {
        if (n.slug === slug) {
          return { ...n, description: "", parent: parent && { id: parent.id, name: parent.name, slug: parent.slug } };
        }
        const hit = walk(n.children, n);
        if (hit) return hit;
      }
      return null;
    };
    return walk((await fixtureHome()).categories, null);
  }
  try {
    return await apiGet<CategoryDetail>(`/catalog/categories/${slugSegment(slug)}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /catalog/search/suggest/?q= — header autocomplete (browser or server). */
export async function getSearchSuggestions(q: string, { fixtures = false } = {}): Promise<SearchSuggestions> {
  const empty: SearchSuggestions = { q, books: [], subjects: [], categories: [], authors: [] };
  if (q.trim().length < 2) return empty;
  if (fixtures || fixturesEnabled()) {
    const { fixtureSuggest } = await import("./fixture-discovery");
    return fixtureSuggest(await fixtureBooks(), (await fixtureHome()).categories, q);
  }
  const res = await fetch(`${apiBase()}/catalog/search/suggest/${queryString({ q })}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!res || !res.ok) return empty;
  return (await res.json()) as SearchSuggestions;
}

/** GET /catalog/study-kits/?exam_type= — recommendations for the /kit builder. */
export async function getStudyKits(examType: string | null = null): Promise<StudyKit[]> {
  if (fixturesEnabled()) {
    const { fixtureStudyKits } = await import("./fixture-discovery");
    return fixtureStudyKits(await fixtureBooks(), await fixtureWeights(), examType);
  }
  return apiGet<StudyKit[]>(`/catalog/study-kits/${queryString({ exam_type: examType })}`);
}

/* ---------- Package الف (SEO builder): shipping methods for the /shipping ShippingService JSON-LD ---------- */

/**
 * GET /shipping-methods/?subtotal=0 (no province → nationwide methods only), cached like catalog reads.
 * Never throws: [] when the API is down or in fixtures mode (no shipping markup then, no made-up rates).
 */
export async function getPublicShippingMethods(): Promise<import("./account-types").ShippingOption[]> {
  if (fixturesEnabled()) return [];
  try {
    const data = await apiGet<unknown>("/shipping-methods/?subtotal=0", 3600);
    return Array.isArray(data) ? (data as import("./account-types").ShippingOption[]) : [];
  } catch {
    return [];
  }
}

/* ---------- growth (research package «و», backend apps.growth) ---------- */

/** GET /growth/campaigns/?placement=home — running campaigns for the home banner ([] when none or offline). */
export async function getHomeCampaigns(): Promise<CampaignSummary[]> {
  if (fixturesEnabled()) return [];
  try {
    return await apiGet<CampaignSummary[]>("/growth/campaigns/?placement=home");
  } catch {
    return [];
  }
}

/** GET /growth/campaigns/<slug>/ — null on 404. */
export async function getCampaign(slug: string): Promise<CampaignDetail | null> {
  if (fixturesEnabled()) return null;
  try {
    return await apiGet<CampaignDetail>(`/growth/campaigns/${slugSegment(slug)}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /growth/kit-shares/resolve/?k= | ?b=&exam= — a shared kit, null when unknown. */
export async function getSharedKit(
  params: { k: string } | { b: string[] },
  exam: string | null = null,
): Promise<SharedKit | null> {
  if (fixturesEnabled()) return null;
  const qs = "k" in params ? queryString({ k: params.k }) : queryString({ b: params.b.join(","), exam });
  try {
    return await apiGet<SharedKit>(`/growth/kit-shares/resolve/${qs}`, 300);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /growth/gifts/<token>/ — the public gift preview (no cache: claim state changes). */
export async function getGift(token: string): Promise<Gift | null> {
  if (fixturesEnabled()) return null;
  const url = `${apiBase()}/growth/gifts/${encodeURIComponent(token)}/`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as Gift;
}
/* ---------- end growth ---------- */

/* ---------- hubs, guides and curated lists (package ب, impl/hubs) ---------- */

/** GET that maps 404 to null (unknown slug, draft without preview key). Fixture mode has no hubs. */
async function apiGetOrNull<T>(path: string, revalidate: number = REVALIDATE_SECONDS): Promise<T | null> {
  if (fixturesEnabled()) return null;
  try {
    return await apiGet<T>(path, revalidate);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET /content/exams/<slug>/ — exam hub (ب۱). */
export function getExamHub(slug: string): Promise<ExamHub | null> {
  return apiGetOrNull<ExamHub>(`/content/exams/${slugSegment(slug)}/`);
}

/** GET /content/subjects/<slug>/ — subject hub (ب۲). */
export function getSubjectHub(slug: string): Promise<SubjectHub | null> {
  return apiGetOrNull<SubjectHub>(`/content/subjects/${slugSegment(slug)}/`);
}

/** GET /content/authors/<slug>/ — author / translator page (ب۳). */
export function getAuthorHub(slug: string): Promise<AuthorHub | null> {
  return apiGetOrNull<AuthorHub>(`/content/authors/${slugSegment(slug)}/`);
}

/** GET /content/publishers/<slug>/ — publisher page (ب۴). */
export function getPublisherHub(slug: string): Promise<PublisherHub | null> {
  return apiGetOrNull<PublisherHub>(`/content/publishers/${slugSegment(slug)}/`);
}

/** GET /content/guides/<slug>/ (ب۵); a draft only with its staff `preview` key (never cached). */
export async function getGuide(slug: string, preview: string | null = null): Promise<GuideDetail | null> {
  if (!preview) return apiGetOrNull<GuideDetail>(`/content/guides/${slugSegment(slug)}/`);
  if (fixturesEnabled()) return null;
  const url = `${apiBase()}/content/guides/${slugSegment(slug)}/${queryString({ preview })}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, url);
  return (await res.json()) as GuideDetail;
}

/** GET /content/lists/<slug>/ — curated list (ب۶). */
export function getCuratedList(slug: string): Promise<CuratedListDetail | null> {
  return apiGetOrNull<CuratedListDetail>(`/content/lists/${slugSegment(slug)}/`);
}
