/**
 * API shapes for package «د» (impl/trust): ownership awareness (د۱), delivery date promise (د۲),
 * post-purchase «شروع مطالعه» (د۳) and the readiness dashboard (د۴). Contract: docs/api-contract.md.
 * Kept apart from types.ts / account-types.ts to avoid parallel-edit clashes.
 */
import type { VariantType } from "./types";

export type OwnedFormat = "PRINT" | "EBOOK";

/** GET /me/owned/ → { books: OwnedBook[] } */
export interface OwnedBook {
  book_id: number;
  slug: string;
  title: string;
  /** PRINT (paid print/bundle order, not refunded) and/or EBOOK (active entitlement) */
  formats: OwnedFormat[];
  can_read: boolean;
  /** ISO datetime of the latest purchase (or the entitlement grant) */
  purchased_at: string | null;
  order_number: string | null;
}

export interface DeliveryEstimate {
  dispatch_date: string;
  min_date: string;
  max_date: string;
  /** «شنبه ۲۰ مهر تا دوشنبه ۲۲ مهر» */
  label: string;
}

export interface ExamClash {
  exam_name: string;
  exam_date: string;
  /** the last delivery date that still leaves a week before the exam */
  safe_until: string;
  message: string;
}

/** GET /delivery-estimate/?province=&exam= */
export interface DeliverySummary {
  estimate: DeliveryEstimate | null;
  methods: {
    id: number;
    code: string;
    name: string;
    tehran_only: boolean;
    estimate: DeliveryEstimate | null;
    exam_clash: ExamClash | null;
  }[];
  exam: { name: string; slug: string; date: string; days_left: number; safe_until: string } | null;
  exam_clash: ExamClash | null;
}

export interface ExamInfo {
  slug: string;
  name: string;
  event_name: string | null;
  date: string | null;
  days_left: number | null;
}

export interface BookMini {
  id: number;
  slug: string;
  title: string;
  cover: string | null;
  subject_color: string | null;
}

/** GET /me/orders/<number>/start/ */
export interface StartStudying {
  order: string;
  read_first: (BookMini & { reader_url: string; percent_read: number }) | null;
  exam: ExamInfo | null;
  plan: { exam_type: string | null; books: { slug: string; title: string }[]; subjects: string[] };
  reminders: ReminderConsent;
}

export interface ReminderConsent {
  sms: boolean;
  consented_at: string | null;
}

export interface ReadinessBook extends BookMini {
  owned: boolean;
  formats: OwnedFormat[];
  /** 0–100 for owned ebooks, null otherwise (print reading is not tracked) */
  percent_read: number | null;
  buy_variant: { id: number; type: VariantType; type_label: string; price: number } | null;
}

export interface ReadinessSubject {
  subject: { id: number; name: string; slug: string; color: string };
  weight: number | null;
  essential_total: number;
  essential_owned: number;
  ready: boolean;
  percent_read: number | null;
  books: ReadinessBook[];
}

/** GET /me/readiness/?exam= */
export interface Readiness {
  exam: ExamInfo | null;
  subjects: ReadinessSubject[];
  ready_subjects: number;
  total_subjects: number;
  /** «آمادگی منابع: ۵ از ۷ درس» */
  headline: string;
}

/** GET /me/back-in-stock/ */
export interface NotifyEntry {
  id: number;
  status: "PENDING" | "NOTIFIED" | "CANCELLED";
  status_label: string;
  created_at: string;
  notified_at: string | null;
  book: BookMini;
  variant: { id: number; type: VariantType; type_label: string; in_stock: boolean };
}
