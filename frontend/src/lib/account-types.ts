/**
 * Phase 3 API types — written 1:1 from docs/api-contract-phase-3.md.
 * Money is integer toman. Times are ISO 8601 strings.
 */

import type { BookCard, ExamTypeMini, VariantType } from "./types";

export interface Me {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_staff: boolean;
  date_joined: string;
}

export interface OtpRequested {
  phone: string;
  expires_in: number;
  resend_in: number;
  length: number;
}

export interface OtpVerified {
  user: Me;
  is_new: boolean;
}

export interface Address {
  id: number;
  title: string;
  recipient_name: string;
  recipient_phone: string;
  province: string;
  city: string;
  postal_code: string;
  address_line: string;
  is_default: boolean;
  is_tehran: boolean;
}

export type AddressInput = Omit<Address, "id" | "is_tehran">;

export interface ShippingOption {
  id: number;
  code: string;
  name: string;
  description: string;
  eta_note: string;
  price: number;
  base_price: number;
  is_free: boolean;
  free_over: number | null;
  tehran_only: boolean;
}

export interface CheckoutItem {
  variant_id: number;
  quantity: number;
}

export interface CheckoutRequest {
  items: CheckoutItem[];
  address_id?: number | null;
  /** quote only, for guests: price shipping by province */
  province?: string | null;
  shipping_method_id?: number | null;
  discount_code?: string | null;
  customer_note?: string;
  /** POST /checkout/ only */
  checkout_key?: string;
  /** growth (و۴), POST /checkout/ only: a gift order (no address; the recipient claims a link) */
  gift?: { sender_name: string; recipient_name: string; message: string } | null;
}

export type QuoteProblemCode = "out_of_stock" | "insufficient_stock" | "inactive" | "placeholder_price";

export interface QuoteLine {
  variant_id: number;
  book_id: number;
  book_slug: string;
  title: string;
  cover: string | null;
  subject_color: string | null;
  variant_type: VariantType;
  variant_type_label: string;
  quantity: number;
  list_price: number;
  unit_price: number;
  line_total: number;
  in_stock: boolean;
  available_quantity: number | null;
}

export interface Quote {
  lines: QuoteLine[];
  items_total: number;
  /** growth (و۶): `campaign` is set when a running campaign's discount was applied automatically */
  discount: { code: string; amount: number; label: string; campaign?: { title: string; slug: string } } | null;
  discount_error: string | null;
  needs_shipping: boolean;
  shipping: ShippingOption | null;
  shipping_total: number;
  total: number;
  free_shipping_remaining: number | null;
  ebook_now: boolean;
  problems: { variant_id: number; code: QuoteProblemCode; message: string }[];
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED";

export interface OrderCover {
  title: string;
  cover: string | null;
  subject_color: string | null;
}

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  status_label: string;
  total: number;
  created_at: string;
  paid_at: string | null;
  items_count: number;
  covers: OrderCover[];
}

export interface OrderItem {
  title: string;
  book_slug: string | null;
  variant_type: VariantType;
  variant_type_label: string;
  quantity: number;
  list_price: number;
  unit_price: number;
  line_total: number;
  cover: string | null;
  subject_color: string | null;
  can_read: boolean;
}

export type AddressSnapshot = Omit<Address, "id" | "is_default" | "is_tehran">;

export interface Order extends OrderSummary {
  items: OrderItem[];
  items_total: number;
  discount_total: number;
  discount_code: string;
  shipping_total: number;
  needs_shipping: boolean;
  shipping_method_name: string;
  shipping_address: AddressSnapshot | null;
  tracking_code: string;
  customer_note: string;
  timeline: { status: OrderStatus; label: string; at: string }[];
  payment: { status: string; ref_id: string; card_pan: string; gateway: string } | null;
  can_pay: boolean;
}

export interface CheckoutCreated {
  order: Order;
  payment_url: string | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LibraryEntry {
  book: BookCard;
  granted_at: string;
  source_order: string | null;
  can_read: boolean;
  /** Where the reader left off; null when the book was never opened. */
  progress?: LibraryProgress | null;
}

export interface LibraryProgress {
  /** 0–100 */
  percent: number;
  page: number;
  total_pages: number;
  updated_at: string;
}

export interface Review {
  id: number;
  rating: number;
  body: string;
  author: string;
  exam_type: ExamTypeMini | null;
  is_verified_purchase: boolean;
  created_at: string;
}

export interface ReviewSummary {
  average: number | null;
  count: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface BookReviews {
  summary: ReviewSummary;
  results: Review[];
}

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MyReview extends Review {
  status: ReviewStatus;
  status_label: string;
  book: { title: string; slug: string };
}

export interface WishlistEntry {
  book: BookCard;
  added_at: string;
}
