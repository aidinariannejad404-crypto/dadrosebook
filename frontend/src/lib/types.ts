/**
 * API types — written 1:1 from docs/api-contract.md (Phase 1, /api/v1/).
 * Money is integer toman. Dates are ISO "YYYY-MM-DD" (Gregorian). URLs are absolute or null.
 */

export type VariantType = "PRINT" | "EBOOK" | "BUNDLE";

/** (added after research, P1-11) */
export type ResourceType = "TEXTBOOK" | "TESTS" | "LAWS" | "QUICK_REVIEW" | "COURSE_NOTES";

/** (added after research, P1-5) role in the selected exam type's active study kits */
export type KitRole = "essential" | "optional";

/** (added after research, P1-20) */
export type BadgeCode = "edition" | "kit_essential" | "bestseller" | "quick_review" | "bundle" | "sample" | "course";
export type BadgeTone = "primary" | "success" | "accent" | "warning" | "info" | "neutral";

/** Server-side card badge (P1-20): ordered, at most 2 — render as-is. */
export interface Badge {
  code: BadgeCode;
  label: string;
  tone: BadgeTone;
}

/** (added after research, P1-14) */
export interface SocialProof {
  /** 1..3 rank by sales within the book's first subject; null when > 3 or no sales */
  subject_rank: number | null;
  /** season sales when ≥ 20, else null */
  season_buyers: number | null;
}

/** (added after research, P1-6) singleton store settings; "" / null = hide */
export interface StoreSettings {
  free_shipping_threshold: number | null;
  print_dispatch_note: string;
  delivery_tehran_note: string;
  delivery_province_note: string;
  /** international digits without "+" → https://wa.me/<n>?text=… */
  consult_whatsapp: string;
  /** username without "@" → https://t.me/<u> */
  consult_telegram: string;
  support_hours: string;
  /** sanitised trust-seal snippet (only <a>/<img>, https) — render as HTML */
  enamad_html: string;
  students_count_claim: string;
}

export interface SubjectMini {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface SubjectWithCount extends SubjectMini {
  book_count: number;
}

export interface ExamTypeMini {
  id: number;
  name: string;
  slug: string;
  short_name: string;
}

export interface PersonMini {
  id: number;
  name: string;
  slug: string;
}

export interface PublisherMini {
  id: number;
  name: string;
  slug: string;
}

export interface Variant {
  id: number;
  type: VariantType;
  type_label: string;
  price: number;
  sale_price: number | null;
  effective_price: number;
  discount_percent: number;
  in_stock: boolean;
  stock: number | null;
  price_is_placeholder: boolean;
  /** (added after research, P1-7) BUNDLE only: PRINT + EBOOK − BUNDLE effective prices when > 0, else null */
  bundle_saving: number | null;
}

export interface BookCard {
  id: number;
  title: string;
  subtitle: string;
  slug: string;
  cover: string | null;
  authors: PersonMini[];
  subjects: SubjectMini[];
  exam_types: ExamTypeMini[];
  /** lowest effective price among active non-placeholder variants */
  min_price: number | null;
  /** price shown on cards: PRINT effective price, else the cheapest (non-placeholder only; null → «قیمت به‌زودی») */
  card_price: number | null;
  /** variant type card_price belongs to, null if none */
  card_format: VariantType | null;
  formats: VariantType[];
  in_stock: boolean;
  print_in_stock: boolean;
  /** always equals resource_type === "QUICK_REVIEW" */
  is_quick_review: boolean;
  volumes: number;

  // --- added after research ---
  resource_type: ResourceType;
  resource_type_label: string;
  /** sample PDF or at least one sample page (P1-4) */
  has_sample: boolean;
  /** filled only when the request carries one exam_type slug (P1-5) */
  kit_role: KitRole | null;
  /** "ویرایش ۱۴۰۵" when publish_year ≥ the current exam year (P1-1) */
  edition_badge: string | null;
  /** free text; "" when unknown → «به‌روز تا: …» (P1-1) */
  law_updated_until: string;
  /** title of the first active related course (P1-13) */
  course_badge: string | null;
  social_proof: SocialProof;
  badges: Badge[];
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  image: string | null;
  link_url: string;
  link_label: string;
}

/* ---------- academy courses (docs/api-contract.md › «Course cross-sell and study-plan lead magnet») ---------- */

export type CourseType =
  | "FULL"
  | "ESSENTIALS"
  | "TIPS_TESTS"
  | "REVIEW"
  | "WORKSHOP_ADVICE"
  | "MOCK"
  | "PACKAGE"
  | "OTHER";

/** Why a course is offered on a book page (only inside `course_offer`). */
export type CourseRelevance = "referenced" | "same_author" | "same_subject" | "general";

export interface Course {
  id: number;
  title: string;
  /** dadrose.com course page; the frontend adds UTM params */
  url: string;
  course_type: CourseType;
  course_type_label: string;
  subject: SubjectMini | null;
  exam_types: ExamTypeMini[];
  teachers: string[];
  /** toman; 0 for free */
  price: number;
  sale_price: number | null;
  effective_price: number;
  is_free: boolean;
  hours: number | null;
  sessions: number | null;
  /** effective_price / hours; null if unknown or free */
  price_per_hour: number | null;
  /** null unless ≥ 100 (honest social proof) */
  students_count: number | null;
  /** null unless reviews_count ≥ 3 and rating ≥ 4.5 */
  rating: number | null;
  reviews_count: number;
  image: string | null;
  /** "" when none */
  intro_video_url: string;
  short_description: string;
  selling_points: string[];
  /** only inside a book's course_offer */
  relevance?: CourseRelevance;
  relevance_label?: string;
}

export type CourseTier = "best" | "better" | "good";

export interface TierCourse extends Course {
  tier: CourseTier;
  is_recommended: boolean;
}

export interface CourseDiscount {
  code: string;
  percent: number | null;
  label: string;
  /** ISO date; defaults to the next exam date */
  expires_on: string;
  days_left: number;
}

export interface ExamCountdownInfo {
  exam_name: string;
  date: string;
  days_left: number;
}

export interface CourseOffer {
  subject: SubjectMini | null;
  /** by days to the selected/next exam: >60 FULL, 15–60 ESSENTIALS, <15 TIPS_TESTS/REVIEW */
  recommended_type: CourseType;
  recommended_reason: string;
  /** referenced or same_author course, shown first and big */
  highlight: Course | null;
  /** good-better-best, max 3, order: best, better, good */
  tiers: TierCourse[];
  /** other relevant open courses, max 4 */
  more: Course[];
  free_sample: { course: Course; video_url: string } | null;
  discount: CourseDiscount | null;
  exam_countdown: ExamCountdownInfo | null;
}

/* ---------- study-plan lead magnet ---------- */

export interface StudyPlanRequest {
  /** normalised 09xxxxxxxxx */
  phone: string;
  exam_type: string;
  subjects: string[];
  books: string[];
  hours_per_day: number;
  consent: boolean;
}

export interface StudyPlanCreated {
  token: string;
  plan_url: string;
}

export interface StudyPlanItem {
  subject: SubjectMini;
  book_title: string;
  book_slug: string;
  pages_from: number;
  pages_to: number;
  task: string;
}

export interface StudyPlanDay {
  date: string;
  items: StudyPlanItem[];
}

export interface StudyPlan {
  token: string;
  created_at: string;
  phone_masked: string;
  exam: { name: string; date: string; days_left: number } | null;
  hours_per_day: number;
  summary: { total_pages: number; study_days: number; review_days: number; pages_per_day: number };
  days: StudyPlanDay[];
  review: { date: string; task: string }[];
  /** max 3, by the same timing rule */
  recommended_courses: Course[];
}

export interface GuideVideo {
  id: number;
  title: string;
  video_url: string;
  thumbnail: string | null;
  subject: SubjectMini | null;
  exam_type: ExamTypeMini | null;
}

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  children: CategoryNode[];
}

export interface CategoryMini {
  id: number;
  name: string;
  slug: string;
}

export interface CategoryDetail extends CategoryNode {
  description: string;
  parent: CategoryMini | null;
}

export interface ExamEvent {
  id: number;
  name: string;
  date: string;
  exam_type: ExamTypeMini;
}

/** Home subject tile: weight = ضریب for the selected exam type (P1-10), null otherwise. */
export interface HomeSubject extends SubjectWithCount {
  weight: number | null;
}

export interface HomePayload {
  next_exam: ExamEvent | null;
  exam_types: ExamTypeMini[];
  subjects: HomeSubject[];
  categories: CategoryNode[];
  hero_banners: Banner[];
  course_banners: Banner[];
  bestsellers: BookCard[];
  quick_review: BookCard[];
  featured_course: Course | null;
  guide_videos: GuideVideo[];
  /** (added after research, P1-3) */
  selected_exam_type: ExamTypeMini | null;
  /** (added after research, P1-6) */
  store: StoreSettings;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SamplePage {
  id: number;
  image: string;
  order: number;
}

export interface KitPlacement {
  exam_type: ExamTypeMini;
  subject: SubjectMini;
  order: number;
  is_essential: boolean;
}

export interface BookDetail extends BookCard {
  publisher: PublisherMini | null;
  translators: PersonMini[];
  categories: CategoryMini[];
  edition: string;
  publish_year: number | null;
  pages: number;
  isbn: string;
  description: string;
  table_of_contents: string;
  study_plan_note: string;
  /** (added after research, P1-16) suggested study days */
  study_days: number | null;
  sample_pdf: string | null;
  sample_pages: SamplePage[];
  intro_video_url: string;
  variants: Variant[];
  related_courses: Course[];
  /** academy cross-sell block; null when no open course is relevant */
  course_offer: CourseOffer | null;
  kit_placements: KitPlacement[];
  is_featured: boolean;
  updated_at: string;
}

export interface StudyKitItem {
  order: number;
  is_essential: boolean;
  book: BookCard & { variants: Variant[] };
}

export interface StudyKit {
  exam_type: ExamTypeMini;
  subject: SubjectMini;
  note: string;
  /** (added after research, P1-10) «ضریب درس» */
  weight: number | null;
  items: StudyKitItem[];
}

export interface ApiError {
  detail: string;
}

/* ---------- Phase 2: cart, back-in-stock, discovery (docs/api-contract-phase-2.md) ---------- */

export interface CartBook {
  id: number;
  title: string;
  slug: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
}

export type CartIssue = "out_of_stock" | "insufficient_stock" | "unavailable" | "price_unavailable";

export interface CartItem {
  id: number;
  variant: Variant;
  book: CartBook;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  line_total: number;
  line_saving: number;
  is_available: boolean;
  issue: CartIssue | null;
}

export interface Cart {
  token: string | null;
  items: CartItem[];
  item_count: number;
  subtotal: number;
  original_subtotal: number;
  savings: number;
  has_physical: boolean;
  has_issues: boolean;
  free_shipping_threshold: number | null;
  free_shipping_remaining: number | null;
  updated_at: string | null;
}

export type CartErrorCode =
  | "out_of_stock"
  | "insufficient_stock"
  | "price_unavailable"
  | "unavailable"
  | "already_in_bundle"
  | "invalid_quantity"
  | "not_found";

export interface CartError {
  code: CartErrorCode | "network";
  detail: string;
  cart: Cart | null;
}

export type CartSource = "kit" | "product" | "card" | "cart" | "other";

export interface BulkAddResult {
  cart: Cart;
  added: number[];
  skipped: { variant_id: number; code: CartErrorCode; detail: string }[];
}

export interface BackInStockRequestBody {
  variant_id: number;
  phone: string;
  source?: "product" | "card" | "cart" | "kit";
}

export interface BackInStockResponse {
  id: number;
  status: "PENDING" | "NOTIFIED" | "CANCELLED";
  created: boolean;
  message: string;
}

export interface FacetOption {
  slug: string;
  name: string;
  count: number;
  color?: string;
}

export interface FacetValue<V extends string> {
  value: V;
  label: string;
  count: number;
}

export interface BookFacets {
  count: number;
  subjects: (FacetOption & { color: string })[];
  exam_types: FacetOption[];
  formats: FacetValue<VariantType>[];
  resource_types: FacetValue<ResourceType>[];
  in_stock: number;
  price: { min: number | null; max: number | null };
}

export interface SuggestBook {
  id: number;
  title: string;
  slug: string;
  cover: string | null;
  subjects: SubjectMini[];
  authors: PersonMini[];
  card_price: number | null;
}

export interface SearchSuggestions {
  q: string;
  books: SuggestBook[];
  subjects: SubjectMini[];
  categories: CategoryMini[];
  authors: PersonMini[];
}

/** Query params accepted by GET /catalog/books/ and /catalog/books/facets/. */
export interface BookQuery {
  q?: string;
  subject?: string[];
  exam_type?: string[];
  category?: string;
  format?: string[];
  resource_type?: string[];
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  has_sample?: boolean;
  quick_review?: boolean;
  ordering?: "-sales_count" | "price" | "-price" | "-created_at" | "title";
  page?: number;
  page_size?: number;
}

/* ---------- Phase 4: secure ebook reader (/library/<slug>/…) ---------- */

export type EbookFormat = "PDF" | "EPUB";
export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export interface ReadingProgress {
  page: number;
  total_pages: number;
  /** 0..100, computed by the server */
  percent: number;
  /** EPUB CFI; "" for PDF */
  location: string;
  updated_at: string;
}

export interface ReaderSession {
  book: {
    slug: string;
    title: string;
    subtitle: string;
    cover: string | null;
    authors: string[];
    subjects: SubjectMini[];
  };
  file: {
    format: EbookFormat;
    version: number;
    /** short-lived signed URL; fetch the whole file once */
    url: string;
    expires_at: string;
  };
  progress: ReadingProgress | null;
  watermark: string;
  /** Phase 6: max characters one copy may take (the reader appends a citation) */
  copy_limit: number;
  /** Phase 6: present when file.format == "EPUB" */
  epub: EpubInfo | null;
  /** Phase 6b: total characters this user may copy from this book (all devices, all time) */
  copy_quota?: CopyQuota | null;
  /** Phase 6b: offline reading (EPUB only; null for PDF or when disabled) */
  offline?: OfflineInfo | null;
}

/* ---------- Phase 6b: offline reading (EPUB) ---------- */

export interface OfflineLicense {
  id: number;
  /** book slug */
  book: string;
  title: string;
  device_label: string;
  expires_at: string;
  created_at: string;
}

export interface OfflineInfo {
  max_books: number;
  days: number;
  /** this device's live license for the book, if any */
  license: OfflineLicense | null;
}

/** `POST /library/<slug>/offline/` → package: the whole book, images inlined as data: URIs. */
export interface OfflinePackage {
  epub: EpubInfo;
  chapters: EpubChapter[];
  watermark: string;
  copy_limit: number;
  copy_quota?: CopyQuota | null;
}

export interface OfflineGrant {
  license: OfflineLicense;
  package: OfflinePackage;
}

/** Phase 6b: server-side total copy quota (`POST /library/<slug>/copies/` answers with `granted`). */
export interface CopyQuota {
  limit: number;
  used: number;
}

export interface CopyRecorded extends CopyQuota {
  granted: number;
}

export type NotesExportFormat = "md" | "html";

/* ---------- Phase 6: EPUB streaming, bookmarks, devices, search ---------- */

export interface EpubChapterMeta {
  index: number;
  title: string;
  /** first virtual page of the chapter (1-based) */
  start_page: number;
  pages: number;
  chars: number;
}

export interface EpubTocItem {
  title: string;
  chapter: number;
  /** "" = chapter start; else the element id is `epub-${anchor}` */
  anchor: string;
  level: number;
}

export interface EpubInfo {
  language: string;
  direction: "rtl" | "ltr";
  total_pages: number;
  chapters: EpubChapterMeta[];
  toc: EpubTocItem[];
}

export interface EpubChapter extends EpubChapterMeta {
  prev: number | null;
  next: number | null;
  /** sanitized server-side */
  html: string;
}

export interface Bookmark {
  id: number;
  page: number;
  /** "epub:<chapter>:<offset>" for EPUB, "" for PDF */
  location: string;
  label: string;
  created_at: string;
}

export interface ReaderDevice {
  id: number;
  label: string;
  last_seen: string;
  current: boolean;
}

export interface SearchResult {
  chapter: number;
  title: string;
  /** nth folded match in that chapter (0-based) */
  occurrence: number;
  before: string;
  match: string;
  after: string;
}

export interface SearchResponse {
  results: SearchResult[];
  truncated: boolean;
}

/** A rectangle as fractions (0..1) of the page box. */
export interface FractionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Highlight {
  id: number;
  page: number;
  text: string;
  note: string;
  color: HighlightColor;
  rects: FractionRect[];
  location: string;
  created_at: string;
  updated_at: string;
}

export interface HighlightCreate {
  page: number;
  text: string;
  note?: string;
  color?: HighlightColor;
  rects: FractionRect[];
  location?: string;
}

/* ---------- UI refresh: card pricing, ratings, quick add; home rails (declaration merging) ---------- */

export interface BookCard {
  /** list price of the card variant when it is discounted (crossed out on cards), else null */
  card_compare_price?: number | null;
  /** rounded discount of the card variant (≥ 1), else null */
  card_discount_percent?: number | null;
  /** variant a card's «افزودن به سبد» adds: the card variant when in stock and sellable, else null */
  quick_add_variant_id?: number | null;
  /** average of approved reviews, only from 5 reviews up (else null) */
  rating_avg?: number | null;
  /** number of approved reviews */
  rating_count?: number;
}

/** An approved 4–5★ review on the homepage strip (author is «علی ر.», never a phone). */
export interface Testimonial {
  id: number;
  rating: number;
  body: string;
  author: string;
  is_verified_purchase: boolean;
  exam_type: ExamTypeMini | null;
  book: { title: string; slug: string };
}

export interface HomePayload {
  /** in-stock books whose card price is discounted, biggest discount first */
  discounted?: BookCard[];
  /** real approved reviews; empty → the strip is hidden */
  testimonials?: Testimonial[];
}

/* ---------- SEO (Phase 5) ---------- */

export interface SitemapEntry {
  slug: string;
  /** ISO 8601 */
  updated_at: string;
}

export interface SitemapBook extends SitemapEntry {
  cover: string | null;
}

/** GET /seo/sitemap/ — active items only (books with at least one active variant). */
export interface SitemapData {
  books: SitemapBook[];
  categories: SitemapEntry[];
  /** hubs (package ب): only pages that pass the indexability guardrail */
  subjects: SitemapEntry[];
  exam_types: SitemapEntry[];
  /** optional so an older backend (before package ب) still parses */
  authors?: SitemapEntry[];
  publishers?: SitemapEntry[];
  guides?: SitemapEntry[];
  lists?: SitemapEntry[];
}

/* ---------- hubs, guides and curated lists (package ب, impl/hubs; GET /content/…) ---------- */

/** Author / translator / reviewer with credentials (bylines, Person JSON-LD). */
export interface PersonProfile extends PersonMini {
  job_title: string;
  affiliation: string;
  photo: string | null;
}

export interface GuideCard {
  id: number;
  title: string;
  slug: string;
  summary: string;
  /** ISO date of the last content review, or null */
  updated_on: string | null;
  author: PersonProfile | null;
  reviewer: PersonProfile | null;
}

/** Fields every hub carries for the indexability guardrail (ب۷). */
export interface HubBase {
  book_count: number;
  /** server verdict: intro long enough + enough books (exam/subject), see backend services/indexing.py */
  indexable: boolean;
  updated_at: string;
}

export interface HubIntro {
  /** sanitised HTML */
  intro: string;
  intro_byline: string;
  intro_is_placeholder: boolean;
}

export interface ExamHub extends HubBase {
  intro_words: number;
  exam: ExamTypeMini & HubIntro;
  next_event: { id: number; name: string; date: string } | null;
  kit: { essential_count: number; book_count: number; subject_count: number };
  groups: { subject: SubjectMini | null; weight: number | null; book_count: number; books: BookCard[] }[];
  courses: Course[];
  guides: GuideCard[];
}

export interface SubjectHub extends HubBase {
  intro_words: number;
  subject: SubjectMini & HubIntro & { description: string };
  books: BookCard[];
  exams: { exam: ExamTypeMini; book_count: number }[];
  authors: { person: PersonProfile; book_count: number }[];
  courses: Course[];
  guides: GuideCard[];
}

export interface AuthorHub extends HubBase {
  person: PersonProfile & { bio: string };
  same_as: string[];
  bio_words: number;
  authored: BookCard[];
  translated: BookCard[];
  subjects: SubjectMini[];
  guides_written: GuideCard[];
  guides_reviewed: GuideCard[];
}

export interface PublisherHub extends HubBase {
  intro_words: number;
  publisher: PublisherMini & { website: string; intro: string };
  books: BookCard[];
  subjects: SubjectMini[];
  authors: { person: PersonProfile; book_count: number }[];
}

export interface GuideDetail extends GuideCard {
  intro: string;
  body: string;
  published_at: string | null;
  updated_at: string;
  is_published: boolean;
  indexable: boolean;
  exam_types: ExamTypeMini[];
  subjects: SubjectMini[];
  books: BookCard[];
}

export interface CuratedListDetail {
  id: number;
  title: string;
  slug: string;
  intro: string;
  ends_on: string | null;
  updated_at: string;
  intro_words: number;
  is_expired: boolean;
  indexable: boolean;
  book_count: number;
  entries: { book: BookCard; note: string }[];
}

/* ---------- ux stream (ج۳ search zero state, ج۵ add-to-calendar, ج۷ ebook facts) ---------- */

export interface CalendarLinks {
  google: string;
}

export interface ExamEvent {
  /** ISO dates of the registration window (both set or both null) */
  registration_start?: string | null;
  registration_end?: string | null;
  /** Google Calendar links; the .ics is `/api/v1/catalog/exam-events/<id>/calendar.ics?kind=` */
  calendar?: { exam: CalendarLinks; registration: CalendarLinks | null };
}

export interface BookDetail {
  /** active ebook file formats, EPUB first; [] when no file is uploaded yet */
  ebook_formats?: ("EPUB" | "PDF")[];
}

/** GET /catalog/search/zero-state/?exam= */
export interface SearchZeroState {
  exam: ExamTypeMini | null;
  /** best sellers for the exam (no query log yet) */
  popular: { id: number; slug: string; title: string }[];
  subjects: SubjectMini[];
}
