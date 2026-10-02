import type { StoreSettings } from "./types";

/** «مشاوره رایگان انتخاب منبع» (P1-12): WhatsApp / Telegram links built from store settings. */
export interface ConsultLinks {
  whatsapp: string | null;
  telegram: string | null;
  message: string;
}

/** WhatsApp wants international digits only (8–15). Anything else is treated as empty. */
export function whatsappDigits(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Telegram usernames: 5–32 of [A-Za-z0-9_], optional leading "@" or t.me/ prefix tolerated. */
export function telegramUsername(raw: string): string | null {
  const u = raw.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u) ? u : null;
}

export function consultMessage({ exam, book }: { exam?: string | null; book?: string | null }): string {
  const who = exam ? `داوطلب ${exam} هستم و ` : "";
  if (book) return `سلام، ${who}درباره کتاب «${book}» سؤال دارم.`;
  return `سلام، ${who}برای انتخاب منابع مطالعه مشاوره می‌خواهم.`;
}

/** Returns null when neither channel is configured (the CTA is hidden entirely). */
export function consultLinks(
  store: Pick<StoreSettings, "consult_whatsapp" | "consult_telegram"> | null | undefined,
  context: { exam?: string | null; book?: string | null } = {},
): ConsultLinks | null {
  if (!store) return null;
  const message = consultMessage(context);
  const wa = whatsappDigits(store.consult_whatsapp ?? "");
  const tg = telegramUsername(store.consult_telegram ?? "");
  if (!wa && !tg) return null;
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : null,
    telegram: tg ? `https://t.me/${tg}` : null,
    message,
  };
}
