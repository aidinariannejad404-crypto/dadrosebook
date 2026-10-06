/**
 * API types for the platform stream (PF-1/2/3/8/11/17): inbox, notification settings, study
 * profile, support tickets and changelog. Kept apart from types.ts to avoid parallel-edit clashes.
 */
import type { LibraryEntry, LibraryProgress } from "./account-types";

export interface NavSummary {
  unread: number;
  has_library: boolean;
  continue_reading: (LibraryEntry & { progress: LibraryProgress }) | null;
  show_onboarding: boolean;
  exam_type: string | null;
}

export interface InboxItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  /** same-site path ("/account/orders/DR1") or "" */
  link: string;
  discount_code: string;
  is_read: boolean;
  created_at: string;
}

export interface PersonalCode {
  code: string;
  title: string;
  received_at: string;
  valid_until: string | null;
  is_valid: boolean;
}

export interface NotificationPreference {
  kind: string;
  label: string;
  marketing: boolean;
  enabled: boolean;
  /** service messages: always on */
  locked: boolean;
}

export interface StudyProfile {
  exam_type: string | null;
  exam_type_name: string | null;
  /** Jalali year, e.g. 1405 */
  exam_year: number | null;
  /** ISO date */
  exam_date: string | null;
  weak_subjects: string[];
  completed: boolean;
}

export interface StudyProfilePayload {
  profile: StudyProfile;
  show_onboarding: boolean;
  year_choices: number[];
  upcoming_exams: { exam_type: string; name: string; date: string }[];
  max_weak_subjects: number;
}

export interface StudyProfileInput {
  exam_type: string | null;
  exam_year: number | null;
  exam_date: string | null;
  weak_subjects: string[];
}

export type TicketStatus = "open" | "answered" | "closed";

export interface TicketMessage {
  id: number;
  author: "customer" | "staff";
  author_label: string;
  body: string;
  created_at: string;
}

export interface TicketSummary {
  tracking_code: string;
  topic: string;
  topic_label: string;
  subject: string;
  status: TicketStatus;
  status_label: string;
  order_number: string | null;
  book_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export interface ChangelogEntry {
  id: number;
  title: string;
  body: string;
  area: "reader" | "store" | "account" | "fix";
  area_label: string;
  link: string;
  published_at: string;
  published_jalali: string;
}
