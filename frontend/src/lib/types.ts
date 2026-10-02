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

export interface Course {
  id: number;
  title: string;
  url: string;
  price: number;
  image: string | null;
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
