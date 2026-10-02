/**
 * API types — written 1:1 from docs/api-contract.md (Phase 1, /api/v1/).
 * Money is integer toman. Dates are ISO "YYYY-MM-DD" (Gregorian). URLs are absolute or null.
 */

export type VariantType = "PRINT" | "EBOOK" | "BUNDLE";

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
  min_price: number | null;
  formats: VariantType[];
  in_stock: boolean;
  print_in_stock: boolean;
  is_quick_review: boolean;
  volumes: number;
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

export interface HomePayload {
  next_exam: ExamEvent | null;
  exam_types: ExamTypeMini[];
  subjects: SubjectWithCount[];
  categories: CategoryNode[];
  hero_banners: Banner[];
  course_banners: Banner[];
  bestsellers: BookCard[];
  quick_review: BookCard[];
  featured_course: Course | null;
  guide_videos: GuideVideo[];
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
  items: StudyKitItem[];
}

export interface ApiError {
  detail: string;
}
