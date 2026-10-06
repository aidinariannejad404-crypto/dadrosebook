/**
 * Analytics (docs/phase-5-contract.md §3, event list in docs/analytics.md).
 *
 * `track()` always:
 *  1. dispatches a `dadrose:analytics` CustomEvent on window,
 *  2. pushes `{ event, ...params }` to window.dataLayer when present,
 *  3. sends the event to self-hosted Umami (`window.umami.track`). Before the Umami script has loaded,
 *     events wait in a queue (max 50, oldest dropped) that is flushed when `window.umami` appears.
 *
 * Money is integer toman; `currency: "TOMAN"` is added to any event carrying `value` or `price`.
 * No personal data: params named like phone/name/address/email are stripped defensively.
 * Call sites should use the typed helpers below rather than `track()` directly.
 */

import type { VariantType } from "./types";

export type AnalyticsEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "kit_built"
  | "notify_me_requested"
  | "course_cross_sell_click"
  | "study_plan_requested"
  // Package الف۷ (SEO builder): sampled field Core Web Vitals
  | "web_vitals"
  // growth (research package «و»)
  | "kit_shared"
  | "shared_kit_added"
  | "gift_link_shared"
  | "gift_claimed"
  | "campaign_viewed"
  // --- package د (impl/trust) ---
  | "owned_book_notice"
  | "delivery_exam_clash_shown"
  | "start_studying_action"
  | "readiness_add_to_cart"
  | "notify_me_cancelled"
  // hubs (package ب, impl/hubs)
  | "hub_cta_click"
  // --- retention stream (ه۲–ه۵، ه۷) ---
  | "reading_goal_met"
  | "study_plan_linked"
  | "study_plan_item_checked"
  | "study_plan_compressed"
  | "edition_upgrade_offer_view"
  | "review_prompt_rated"
// --- end retention stream ---
  // --- platform stream (PF-8/9/11/14/17) ---
  | "onboarding_saved"
  | "onboarding_skipped"
  | "continue_reading_click"
  | "install_prompt_shown"
  | "install_prompt_result"
  | "support_ticket_created"
  | "otp_help_opened"
  // --- ux stream ---
  | "search_zero_state_click"
  | "undo_remove"
  | "add_to_calendar"
  | "wishlist_toggle"
  | "compare_open"
  // reader stream: د۵ sample, ه۶ free ebook, ه۸ problem report, و۲ quote card
  | "reader_sample_opened"
  | "sample_cta_click"
  | "free_ebook_claimed"
  | "reader_problem_reported"
  | "quote_card_shared";

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsParams = Record<string, AnalyticsValue>;

export interface AnalyticsDetail {
  event: AnalyticsEvent;
  params: AnalyticsParams;
}

interface UmamiTracker {
  track: (event: string, data?: Record<string, string | number | boolean>) => unknown;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    umami?: UmamiTracker;
  }
}

export const CURRENCY = "TOMAN";
export const QUEUE_MAX = 50;
const POLL_MS = 500;
/** stop polling for window.umami after this long (script blocked / failed); the queue is kept */
const POLL_MAX_MS = 60_000;

/** Param keys never sent (exact key, or containing one of these words — `item_name` etc. stay). */
const PII_KEYS = /^(?:name|first_name|last_name|full_name)$|phone|mobile|email|address/i;
/** An Iranian mobile number as a whole value, in any digit set. */
const PHONE_VALUE = /^(?:\+98|0098|98|0)?9\d{9}$/;

type QueuedEvent = [string, Record<string, string | number | boolean>];
let queue: QueuedEvent[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollStarted = 0;
const sentPurchases = new Set<string>();

/** Umami is configured when its website id is set (inlined at build time). */
function umamiEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && process.env.NEXT_PUBLIC_UMAMI_SRC);
}

function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Drop undefined/null and personal data; add the currency to money-carrying events. */
export function sanitizeParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (PII_KEYS.test(key)) continue;
    if (typeof value === "string" && PHONE_VALUE.test(toAsciiDigits(value).replace(/[\s-]/g, ""))) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    out[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (("value" in out || "price" in out) && !("currency" in out)) out.currency = CURRENCY;
  return out;
}

function umamiReady(): boolean {
  return typeof window !== "undefined" && typeof window.umami?.track === "function";
}

function send(event: string, data: Record<string, string | number | boolean>): void {
  try {
    window.umami!.track(event, data);
  } catch {
    // analytics must never break the UI
  }
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Send queued events once `window.umami` exists. Also called from the Umami script's onLoad. */
export function flushAnalyticsQueue(): void {
  if (!umamiReady()) return;
  stopPolling();
  const pending = queue;
  queue = [];
  for (const [event, data] of pending) send(event, data);
}

function startPolling(): void {
  if (pollTimer || typeof setInterval === "undefined") return;
  pollStarted = Date.now();
  pollTimer = setInterval(() => {
    if (umamiReady()) flushAnalyticsQueue();
    else if (Date.now() - pollStarted > POLL_MAX_MS) stopPolling();
  }, POLL_MS);
}

function toUmami(event: string, data: Record<string, string | number | boolean>): void {
  if (!umamiEnabled()) return;
  if (umamiReady()) {
    flushAnalyticsQueue();
    send(event, data);
    return;
  }
  queue.push([event, data]);
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
  startPolling();
}

export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    const clean = sanitizeParams(params);
    window.dispatchEvent(new CustomEvent<AnalyticsDetail>("dadrose:analytics", { detail: { event, params: clean } }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event, ...clean });
    toUmami(event, clean);
  } catch {
    // analytics must never break the UI
  }
}

/* ---------- typed helpers (the API other phases call) ---------- */

export interface AnalyticsItem {
  item_id: number;
  item_name: string;
  variant?: VariantType;
  /** integer toman */
  price?: number | null;
  /** subject slug */
  subject?: string;
  /** exam type slug */
  exam_type?: string;
}

/** Sorted, de-duplicated "EBOOK,PRINT" (Umami event data is flat). */
function formatList(formats: readonly VariantType[]): string {
  return [...new Set(formats)].sort().join(",");
}

function itemParams(item: AnalyticsItem): AnalyticsParams {
  return {
    item_id: item.item_id,
    item_name: item.item_name,
    variant: item.variant,
    price: item.price,
    subject: item.subject,
    exam_type: item.exam_type,
  };
}

/** Product page view. */
export function trackViewItem(item: AnalyticsItem): void {
  track("view_item", itemParams(item));
}

/** Item added to the cart (Phase 2). `value` = price × quantity when the price is known. */
export function trackAddToCart(
  item: AnalyticsItem & { quantity: number; source?: "product" | "card" | "kit" | "sticky" },
): void {
  track("add_to_cart", {
    ...itemParams(item),
    quantity: item.quantity,
    source: item.source,
    value: item.price != null ? item.price * item.quantity : undefined,
  });
}

/** Checkout started (Phase 2/3). `items` = number of units; `value` in toman. */
export function trackBeginCheckout(cart: { value: number; items: number; formats: VariantType[] }): void {
  track("begin_checkout", { value: cart.value, items: cart.items, formats: formatList(cart.formats) });
}

function purchaseKey(orderNumber: string): string {
  return `dadrose:purchase:${orderNumber}`;
}

/**
 * Paid order on the payment result page (Phase 3). Sent once per order_number per browser session
 * (sessionStorage + in-memory), since the backend's server-side `purchase` is the authoritative count.
 */
export function trackPurchase(order: {
  order_number: string;
  value: number;
  items: number;
  formats: VariantType[];
  has_bundle: boolean;
  discount_code?: string;
}): void {
  if (typeof window === "undefined" || !order.order_number) return;
  const key = purchaseKey(order.order_number);
  if (sentPurchases.has(key)) return;
  try {
    if (window.sessionStorage?.getItem(key)) return;
  } catch {
    // storage blocked: fall back to the in-memory set
  }
  sentPurchases.add(key);
  try {
    window.sessionStorage?.setItem(key, "1");
  } catch {
    // ignore
  }
  track("purchase", {
    order_number: order.order_number,
    value: order.value,
    items: order.items,
    formats: formatList(order.formats),
    has_bundle: order.has_bundle,
    discount_code: order.discount_code || undefined,
  });
}

/** Study kit built / added to cart from /kit (Phase 2). */
export function trackKitBuilt(kit: { exam_type: string; subjects: number; books: number; value: number }): void {
  track("kit_built", { exam_type: kit.exam_type, subjects: kit.subjects, books: kit.books, value: kit.value });
}

/** «موجود شد خبرم کن» clicked/registered. */
export function trackNotifyMeRequested(item: { item_id: number; item_name: string; variant: VariantType }): void {
  track("notify_me_requested", { item_id: item.item_id, item_name: item.item_name, variant: item.variant });
}

export interface CourseCrossSellClick {
  course_id: number | string;
  course_title: string;
  book_slug?: string | null;
  /** where the link sits, e.g. "home", "highlight", "more", "buy_box", "plan" */
  placement: string;
}

/** Click on an academy course link (dadrose.com). */
export function trackCourseCrossSellClick(c: CourseCrossSellClick): void {
  track("course_cross_sell_click", {
    course_id: c.course_id,
    course_title: c.course_title,
    book_slug: c.book_slug ?? undefined,
    placement: c.placement,
  });
}

/** Study-plan lead magnet submitted (the phone number is never sent). */
export function trackStudyPlanRequested(p: {
  exam_type: string;
  subjects: string[];
  hours_per_day: number;
  book?: string | null;
}): void {
  track("study_plan_requested", {
    exam_type: p.exam_type,
    subjects: p.subjects.join(","),
    subjects_count: p.subjects.length,
    hours_per_day: p.hours_per_day,
    book: p.book ?? undefined,
  });
}

/* ---------- Package الف۷ (SEO builder): field Core Web Vitals ---------- */

/** One sampled Core Web Vital (lib/web-vitals.ts `vitalPayload`); no URL or personal data is sent. */
export function trackWebVital(v: {
  metric: string;
  metric_value: number;
  rating: string;
  page_type: string;
  connection: string;
  navigation_type: string;
}): void {
  track("web_vitals", { ...v });
}

// --- package د (impl/trust) ---

/** د۱: an «این کتاب را دارید» banner or duplicate warning was shown. */
export function trackOwnedBookNotice(p: { item_id: number; formats: string[]; surface: "product" | "kit" | "cart" }): void {
  track("owned_book_notice", { item_id: p.item_id, formats: p.formats.join(","), surface: p.surface });
}

/** د۳: a post-purchase «شروع مطالعه» action. */
export function trackStartStudying(action: "read_first" | "study_plan" | "reminders_on" | "reminders_off", order: string): void {
  track("start_studying_action", { action, transaction_id: order });
}

/* --- hubs (package ب, impl/hubs) --- */

export interface HubCtaClick {
  /** exam | subject | author | publisher | guide | list */
  hub: string;
  slug: string;
  /** which call to action, e.g. "kit", "guide", "all_books" */
  cta: string;
}

/** Click on a call to action inside a hub page (kit CTA, guide link…). */
export function trackHubCtaClick(c: HubCtaClick): void {
  track("hub_cta_click", { hub: c.hub, slug: c.slug, cta: c.cta });
}

// --- platform stream (PF-8/9/11/14/17) ---

/** Onboarding sheet saved (exam slug, year and the number of weak subjects only). */
export function trackOnboarding(p: { saved: boolean; exam_type?: string | null; exam_year?: number | null; weak_subjects?: number }): void {
  if (!p.saved) {
    track("onboarding_skipped");
    return;
  }
  track("onboarding_saved", { exam_type: p.exam_type ?? undefined, exam_year: p.exam_year ?? undefined, weak_subjects: p.weak_subjects ?? 0 });
}

export function trackContinueReading(p: { book_slug: string; placement: "home" | "bottom_nav" }): void {
  track("continue_reading_click", p);
}

export function trackInstallPrompt(p: { platform: "prompt" | "ios"; placement: string; outcome?: "accepted" | "dismissed" | "closed" }): void {
  track(p.outcome ? "install_prompt_result" : "install_prompt_shown", p);
}

export function trackSupportTicket(p: { topic: string; source: string; logged_in: boolean }): void {
  track("support_ticket_created", p);
}

export function trackOtpHelp(p: { voice_available: boolean }): void {
  track("otp_help_opened", p);
}

/* ---------- reader stream (د۵, ه۶, ه۸, و۲) ---------- */

/** The free sample opened in the reader (`source`: "product" button or a direct link). */
export function trackReaderSampleOpened(p: { book: string; format: string; pages: number }): void {
  track("reader_sample_opened", { book: p.book, format: p.format, pages: p.pages });
}

/** A buy button at the end of the sample (`variant`: EBOOK/BUNDLE, or "product" for the page link). */
export function trackSampleCtaClick(p: { book: string; variant: string; price?: number | null }): void {
  track("sample_cta_click", { book: p.book, variant: p.variant, price: p.price ?? undefined });
}

/** «دریافت رایگان» succeeded (`created` false = it was already in the library). */
export function trackFreeEbookClaimed(p: { book: string; created: boolean }): void {
  track("free_ebook_claimed", { book: p.book, created: p.created });
}

/** «گزارش مشکل» sent from the reader. */
export function trackReaderProblemReported(p: { book: string; kind: string; format: string }): void {
  track("reader_problem_reported", { book: p.book, kind: p.kind, format: p.format });
}

/** Quote card produced (`method`: shared through the share sheet, or downloaded). */
export function trackQuoteCardShared(p: { book: string; chars: number; method: "shared" | "downloaded" }): void {
  track("quote_card_shared", { book: p.book, chars: p.chars, method: p.method });
}

/** Test helper: reset the queue, dedupe set and poller. */
export function _resetAnalyticsForTests(): void {
  stopPolling();
  queue = [];
  sentPurchases.clear();
}

/** Test helper: number of events waiting for Umami. */
export function _queuedEventsForTests(): number {
  return queue.length;
}

/* ---------- growth (research package «و») ---------- */

/** A kit share link was created and sent («ارسال به گروه مطالعه» / copy). */
export function trackKitShared(p: { exam_type: string | null; books: number; channel: "telegram" | "whatsapp" | "copy" | "native" }): void {
  track("kit_shared", { exam_type: p.exam_type ?? undefined, books: p.books, channel: p.channel });
}

/** A recipient added a shared kit to the cart («افزودن همه»). */
export function trackSharedKitAdded(p: { books: number; value: number; via: "token" | "slugs" }): void {
  track("shared_kit_added", { books: p.books, value: p.value, via: p.via });
}

/** The buyer shared or printed a gift link. */
export function trackGiftLinkShared(p: { channel: "telegram" | "whatsapp" | "copy" | "print" }): void {
  track("gift_link_shared", { channel: p.channel });
}

/** A gift link was claimed (no identity is sent). */
export function trackGiftClaimed(p: { has_ebook: boolean; needs_address: boolean; items: number }): void {
  track("gift_claimed", { has_ebook: p.has_ebook, needs_address: p.needs_address, items: p.items });
}

/** A campaign landing was viewed. */
export function trackCampaignViewed(p: { slug: string; state: string }): void {
  track("campaign_viewed", { campaign: p.slug, state: p.state });
}
/* ---------- end growth ---------- */
/* --- retention stream (ه۲–ه۵، ه۷) --- */

export function trackReadingGoalMet(p: { goal_minutes: number; streak: number; milestone: number }): void {
  track("reading_goal_met", { goal_minutes: p.goal_minutes, streak: p.streak, milestone: p.milestone });
}

export function trackStudyPlanLinked(p: { source: "lead" | "library" }): void {
  track("study_plan_linked", { source: p.source });
}

export function trackStudyPlanItemChecked(p: { done: boolean; where: "today" | "plan" }): void {
  track("study_plan_item_checked", { done: p.done, where: p.where });
}

export function trackStudyPlanCompressed(p: { behind_days: number }): void {
  track("study_plan_compressed", { behind_days: p.behind_days });
}

export function trackEditionUpgradeOfferView(p: { item_id: string; percent: number }): void {
  track("edition_upgrade_offer_view", { item_id: p.item_id, percent: p.percent });
}

export function trackReviewPromptRated(p: { rating: number; reason: string }): void {
  track("review_prompt_rated", { rating: p.rating, reason: p.reason });
}
/* --- end retention stream --- */
/* ---------- ux stream (ج۳, ج۴, ج۵, ج۶, د۶) ---------- */

/** A tap in the empty-search panel: a recent term, a popular book or a subject shortcut. */
export function trackSearchZeroStateClick(kind: "recent" | "popular" | "subject", exam: string | null): void {
  track("search_zero_state_click", { kind, exam_type: exam ?? undefined });
}

/** «بازگرداندن» after removing a cart line or a wishlist heart. */
export function trackUndoRemove(target: "cart" | "wishlist"): void {
  track("undo_remove", { target });
}

/** .ics download or Google Calendar link for an exam date / registration window. */
export function trackAddToCalendar(c: { kind: "exam" | "registration"; via: "ics" | "google"; exam_type: string; placement: string }): void {
  track("add_to_calendar", c);
}

/** Heart toggled; `guest` = kept in this browser until login. */
export function trackWishlistToggle(w: { item_id: number; on: boolean; guest: boolean }): void {
  track("wishlist_toggle", w);
}

/** Compare page opened with `count` books. */
export function trackCompareOpen(count: number): void {
  track("compare_open", { count });
}
