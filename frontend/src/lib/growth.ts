import type { BookCard, BookDetail, ExamEvent, ExamTypeMini, Variant, VariantType } from "./types";

/**
 * Growth loops (research package «و», backend `apps.growth`): Torob meta tags, shareable kit links,
 * gifts by link and exam-calendar campaigns. Types and pure helpers only (tested in growth.test.ts).
 */

export type BookWithVariants = BookCard & { variants: Variant[] };

/* ---------- و۱ Torob meta tags ---------- */

export type TorobPriceUnit = "toman" | "rial";

/** Same switch as the backend's TOROB_PRICE_UNIT (confirm the unit in the Torob seller panel). */
export function torobPriceUnit(): TorobPriceUnit {
  return process.env.NEXT_PUBLIC_TOROB_PRICE_UNIT === "rial" ? "rial" : "toman";
}

const TOROB_FORMAT_ORDER: VariantType[] = ["PRINT", "EBOOK", "BUNDLE"];

/**
 * The variant whose offer the product page announces to Torob: the print edition when sellable,
 * else the first sellable format (placeholder prices are never announced).
 */
export function torobVariant(variants: Variant[]): Variant | null {
  const sellable = variants.filter((v) => !v.price_is_placeholder);
  for (const type of TOROB_FORMAT_ORDER) {
    const v = sellable.find((x) => x.type === type);
    if (v) return v;
  }
  return null;
}

/**
 * `<meta name="product_*">` tags Torob reads when it crawls a product page (fallback to the API).
 * product_id equals the API's page_unique (variant id). Empty object when nothing is for sale.
 */
export function torobMeta(
  book: Pick<BookDetail, "title" | "variants">,
  unit: TorobPriceUnit = torobPriceUnit(),
  guarantee = "ضمانت اصالت و سلامت فیزیکی کالا",
): Record<string, string> {
  const v = torobVariant(book.variants);
  if (!v) return {};
  const k = unit === "rial" ? 10 : 1;
  const meta: Record<string, string> = {
    product_id: String(v.id),
    product_name: book.title,
    product_price: String(v.effective_price * k),
    availability: v.in_stock ? "instock" : "outofstock",
    guarantee,
  };
  if (v.sale_price != null && v.sale_price < v.price) meta.product_old_price = String(v.price * k);
  return meta;
}

/* ---------- و۳ shareable kit links ---------- */

export interface SharedKitItem {
  book: BookWithVariants;
  /** the sharer's chosen format (token links); null → the book's default format */
  variant_id: number | null;
}

export interface SharedKit {
  token: string | null;
  exam: ExamTypeMini | null;
  items: SharedKitItem[];
}

export interface KitShareCreated {
  token: string;
  /** "/kit?k=<token>" */
  path: string;
}

/** `/kit` params that turn the page into the shared-kit view (noindex, canonical /kit). */
export function sharedKitParams(sp: Record<string, string | string[] | undefined>): { k: string } | { b: string[] } | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const k = first(sp.k).trim();
  if (/^[A-Za-z0-9_-]{4,16}$/.test(k)) return { k };
  const b = first(sp.b)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  return b.length ? { b } : null;
}

/** Fallback link when the short link cannot be created: `/kit?exam=…&b=slug1,slug2`. */
export function kitSlugsUrl(exam: string | null, slugs: string[]): string {
  const qs = new URLSearchParams();
  if (exam) qs.set("exam", exam);
  qs.set("b", slugs.join(","));
  return `/kit?${qs.toString()}`;
}

export interface ShareIntents {
  telegram: string;
  whatsapp: string;
}

/** «ارسال به گروه مطالعه»: Telegram and WhatsApp share intents for an absolute URL. */
export function shareIntents(url: string, text: string): ShareIntents {
  return {
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  };
}

const DEFAULT_ORDER: VariantType[] = ["BUNDLE", "PRINT", "EBOOK"];

/** The format a recipient gets for a shared book: the sharer's choice when still buyable, else the kit default. */
export function sharedVariant(item: SharedKitItem): Variant | null {
  const buyable = (v: Variant) => !v.price_is_placeholder && v.in_stock;
  const chosen = item.book.variants.find((v) => v.id === item.variant_id);
  if (chosen && buyable(chosen)) return chosen;
  for (const type of DEFAULT_ORDER) {
    const v = item.book.variants.find((x) => x.type === type && buyable(x));
    if (v) return v;
  }
  return null;
}

/** Lines the «افزودن همه» button adds, one per buyable book. */
export function sharedKitLines(items: SharedKitItem[]): { item: SharedKitItem; variant: Variant }[] {
  const out: { item: SharedKitItem; variant: Variant }[] = [];
  for (const item of items) {
    const variant = sharedVariant(item);
    if (variant) out.push({ item, variant });
  }
  return out;
}

/** OG image URL for a shared kit (covers drawn from the same params). */
export function kitShareImagePath(params: { k: string } | { b: string[] }, exam: string | null = null): string {
  const qs = new URLSearchParams();
  if ("k" in params) qs.set("k", params.k);
  else {
    qs.set("b", params.b.join(","));
    if (exam) qs.set("exam", exam);
  }
  return `/kit/share-image?${qs.toString()}`;
}

/* ---------- و۴ gifts ---------- */

export type GiftState = "pending" | "active" | "claimed" | "expired" | "cancelled";

export interface GiftItem {
  title: string;
  book_slug: string | null;
  variant_type: VariantType;
  quantity: number;
  cover: string | null;
  subject_color: string | null;
}

export interface Gift {
  token: string;
  sender_name: string;
  recipient_name: string;
  message: string;
  state: GiftState;
  expires_at: string | null;
  claimed_at: string | null;
  needs_address: boolean;
  has_ebook: boolean;
  claimed_by_me: boolean;
  items: GiftItem[];
}

export interface OwnedGift extends Gift {
  claim_url: string | null;
  order_number: string;
}

export interface GiftRequest {
  sender_name: string;
  recipient_name: string;
  message: string;
}

export const GIFT_MESSAGE_MAX = 300;

export const GIFT_STATE_LABEL: Record<GiftState, string> = {
  pending: "در انتظار پرداخت",
  active: "آماده دریافت",
  claimed: "دریافت شد",
  expired: "مهلت دریافت تمام شده",
  cancelled: "لغو شده",
};

/** Trimmed gift fields for POST /checkout/ (sender defaults to «یک دوست» on the server). */
export function giftPayload(g: GiftRequest): GiftRequest {
  const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  return {
    sender_name: clean(g.sender_name, 80),
    recipient_name: clean(g.recipient_name, 80),
    message: clean(g.message, GIFT_MESSAGE_MAX),
  };
}

/** Text shared with the claim link. */
export function giftShareText(g: Pick<Gift, "sender_name" | "recipient_name">): string {
  const to = g.recipient_name ? `${g.recipient_name} عزیز، ` : "";
  return `${to}${g.sender_name} برایت کتاب هدیه فرستاده است. با این لینک هدیه‌ات را دریافت کن:`;
}

/* ---------- و۶ campaigns ---------- */

export type CampaignState = "upcoming" | "active" | "ended";

export interface CampaignSummary {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  hero_image: string | null;
  hero_color: string;
  starts_at: string;
  ends_at: string;
  state: CampaignState;
  /** «۱۰٪ تخفیف» — null when the campaign has no active discount rule */
  discount_label: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  description: string;
  exam_event: ExamEvent | null;
  min_order_total: number;
  books: BookWithVariants[];
}

export const campaignPath = (slug: string) => `/campaign/${encodeURIComponent(slug)}`;

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Time left until `iso` (never negative). */
export function countdownTo(iso: string, now: number): TimeLeft {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: ms === 0,
  };
}

/** The campaign state at `now` (the API's `state` may be up to a minute stale in ISR pages). */
export function campaignStateAt(c: Pick<CampaignSummary, "starts_at" | "ends_at">, now: number): CampaignState {
  if (now < new Date(c.starts_at).getTime()) return "upcoming";
  if (now > new Date(c.ends_at).getTime()) return "ended";
  return "active";
}

/** Discount line in the cart / checkout when the quote auto-applied a campaign. */
export interface QuoteCampaign {
  title: string;
  slug: string;
}
