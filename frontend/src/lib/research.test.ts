import { describe, expect, it } from "vitest";
import { BADGE_TONE_CLASS, badgeToneClass, cardBadges } from "./badges";
import { EXAM_COOKIE_MAX_AGE, examSetCookie, examSlugFromCookieHeader, parseExamSlug } from "./exam-cookie";
import { consultLinks, consultMessage, telegramUsername, whatsappDigits } from "./consult";
import { daysLeft, isLowTime, needsQuickReviewHint, pickExamEvent, quickReviewFirst, tehranToday } from "./exam-time";
import { examCountdown } from "./countdown";
import { cardStockNote, defaultVariant, deliveryLines, purchasableEbook } from "./variants";
import { formatsClaim, productDescription, productTitle } from "./product-meta";
import { bookEdition, bookJsonLd } from "./jsonld";
import type { Badge, BookCard, BookDetail, ExamEvent, HomePayload, StoreSettings, Variant } from "./types";
import books from "./__fixtures__/books.json";
import home from "./__fixtures__/home.json";

const NOW = Date.parse("2026-10-02T12:00:00Z"); // 15:30 in Tehran

const variant = (type: Variant["type"], o: Partial<Variant> = {}): Variant => ({
  id: { PRINT: 1, EBOOK: 2, BUNDLE: 3 }[type],
  type,
  type_label: type,
  price: 100,
  sale_price: null,
  effective_price: 100,
  discount_percent: 0,
  in_stock: true,
  stock: type === "EBOOK" ? null : 5,
  price_is_placeholder: false,
  bundle_saving: null,
  ...o,
});

const store: StoreSettings = {
  free_shipping_threshold: null,
  print_dispatch_note: "ارسال حداکثر ۱ روز کاری پس از سفارش",
  delivery_tehran_note: "تحویل تهران ۱ تا ۲ روز کاری",
  delivery_province_note: "",
  consult_whatsapp: "",
  consult_telegram: "",
  support_hours: "",
  enamad_html: "",
  students_count_claim: "",
};

describe("badge tone mapping", () => {
  it("maps every contract tone to token classes", () => {
    for (const tone of ["primary", "success", "accent", "warning", "info", "neutral"] as const) {
      expect(badgeToneClass(tone)).toBe(BADGE_TONE_CLASS[tone]);
      expect(badgeToneClass(tone)).toMatch(/^bg-[\w-]+ text-[\w-]+$/);
    }
  });
  it("never uses gold as text colour and falls back to neutral for unknown tones", () => {
    expect(badgeToneClass("accent")).toContain("text-accent-ink");
    expect(badgeToneClass("sparkly")).toBe(BADGE_TONE_CLASS.neutral);
    expect(badgeToneClass("toString")).toBe(BADGE_TONE_CLASS.neutral);
  });
  it("keeps API order, drops empty labels, max two", () => {
    const b = (code: Badge["code"], label: string = code): Badge => ({ code, label, tone: "info" });
    expect(cardBadges([b("edition"), b("bestseller", " "), b("quick_review"), b("sample")]).map((x) => x.code)).toEqual([
      "edition",
      "quick_review",
    ]);
    expect(cardBadges(undefined)).toEqual([]);
  });
});

describe("exam cookie", () => {
  const slug = "کانون-وکلا";
  it("parses raw and URL-encoded slugs and rejects junk", () => {
    expect(parseExamSlug(slug)).toBe(slug);
    expect(parseExamSlug(encodeURIComponent(slug))).toBe(slug);
    expect(parseExamSlug("")).toBeNull();
    expect(parseExamSlug(undefined)).toBeNull();
    expect(parseExamSlug("a b")).toBeNull();
    expect(parseExamSlug("<script>")).toBeNull();
    expect(parseExamSlug("%E0%A4%A")).toBeNull();
    expect(parseExamSlug("x".repeat(81))).toBeNull();
  });
  it("reads the exam cookie from a Cookie header", () => {
    const header = `theme=dark; exam=${encodeURIComponent(slug)}; other=1`;
    expect(examSlugFromCookieHeader(header)).toBe(slug);
    expect(examSlugFromCookieHeader("examx=1; theme=dark")).toBeNull();
    expect(examSlugFromCookieHeader(null)).toBeNull();
  });
  it("writes a 180-day SameSite=Lax cookie and clears it", () => {
    const set = examSetCookie(slug);
    expect(set).toContain(`exam=${encodeURIComponent(slug)}`);
    expect(set).toContain(`Max-Age=${EXAM_COOKIE_MAX_AGE}`);
    expect(EXAM_COOKIE_MAX_AGE).toBe(180 * 86400);
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/");
    expect(set).not.toContain("Secure");
    expect(examSetCookie(slug, true)).toContain("Secure");
    expect(examSetCookie(null)).toMatch(/^exam=; Max-Age=0/);
  });
});

describe("consult links", () => {
  it("normalises WhatsApp numbers and Telegram usernames", () => {
    expect(whatsappDigits("+98 912 123 4567")).toBe("989121234567");
    expect(whatsappDigits("12")).toBeNull();
    expect(telegramUsername("@dadrose_support")).toBe("dadrose_support");
    expect(telegramUsername("https://t.me/dadrose_support")).toBe("dadrose_support");
    expect(telegramUsername("bad name")).toBeNull();
  });
  it("hides entirely when both channels are empty", () => {
    expect(consultLinks(store)).toBeNull();
    expect(consultLinks(null)).toBeNull();
  });
  it("builds wa.me with a prefilled Persian message and t.me", () => {
    const links = consultLinks(
      { consult_whatsapp: "989121234567", consult_telegram: "dadrose_support" },
      { exam: "کانون وکلا", book: "حقوق مدنی دوجلدی" },
    )!;
    expect(links.message).toBe("سلام، داوطلب کانون وکلا هستم و درباره کتاب «حقوق مدنی دوجلدی» سؤال دارم.");
    const wa = new URL(links.whatsapp!);
    expect(wa.origin + wa.pathname).toBe("https://wa.me/989121234567");
    expect(wa.searchParams.get("text")).toBe(links.message);
    expect(links.telegram).toBe("https://t.me/dadrose_support");
  });
  it("adapts the message to the context", () => {
    expect(consultMessage({})).toBe("سلام، برای انتخاب منابع مطالعه مشاوره می‌خواهم.");
    expect(consultMessage({ book: "x" })).toBe("سلام، درباره کتاب «x» سؤال دارم.");
    expect(consultLinks({ consult_whatsapp: "", consult_telegram: "dadrose_support" })?.whatsapp).toBeNull();
  });
});

describe("days left (Tehran time)", () => {
  it("matches the countdown bar's whole days", () => {
    expect(tehranToday(NOW)).toBe("2026-10-02");
    expect(daysLeft("2026-11-05", NOW)).toBe(examCountdown("2026-11-05", NOW).days);
    expect(daysLeft("2026-11-05", NOW)).toBe(33);
    expect(daysLeft("2026-10-03", NOW)).toBe(0); // 8.5 hours left
    expect(daysLeft("2026-10-02", NOW)).toBe(-1);
    expect(daysLeft("", NOW)).toBeNull();
    expect(daysLeft("not-a-date", NOW)).toBeNull();
  });
  it("counts to midnight in Tehran, not UTC", () => {
    // exam 2026-10-04 starts 2026-10-03T20:30Z; from 2026-10-02T20:00Z that is 24.5 h → 1 day
    expect(daysLeft("2026-10-04", Date.parse("2026-10-02T20:00:00Z"))).toBe(1);
    expect(daysLeft("2026-10-04", Date.parse("2026-10-02T21:00:00Z"))).toBe(0);
    expect(tehranToday(Date.parse("2026-10-02T21:00:00Z"))).toBe("2026-10-03");
  });
  it("low time is 1..13 days", () => {
    expect(isLowTime(13)).toBe(true);
    expect(isLowTime(14)).toBe(false);
    expect(isLowTime(0)).toBe(false);
    expect(isLowTime(null)).toBe(false);
  });
  it("hints the quick review only when study days exceed days left", () => {
    expect(needsQuickReviewHint(40, 34, false)).toBe(true);
    expect(needsQuickReviewHint(30, 34, false)).toBe(false);
    expect(needsQuickReviewHint(40, 34, true)).toBe(false);
    expect(needsQuickReviewHint(null, 34, false)).toBe(false);
    expect(needsQuickReviewHint(40, null, false)).toBe(false);
  });
});

describe("homepage ordering (P1-9)", () => {
  it("puts quick review first within 45 days of the exam", () => {
    expect(quickReviewFirst("2026-11-05", NOW)).toBe(true); // 33 days
    expect(quickReviewFirst("2026-11-17", NOW)).toBe(true); // 45 days
    expect(quickReviewFirst("2026-11-18", NOW)).toBe(false); // 46 days
    expect(quickReviewFirst("2026-10-01", NOW)).toBe(false); // past
    expect(quickReviewFirst(null, NOW)).toBe(false);
  });
});

describe("pickExamEvent", () => {
  const ev = (id: number, slug: string, date: string): ExamEvent => ({
    id,
    name: `آزمون ${slug}`,
    date,
    exam_type: { id, name: slug, slug, short_name: slug },
  });
  const events = [ev(9, "past", "2026-09-01"), ev(1, "kanoon", "2026-11-05"), ev(2, "markaz", "2026-12-11"), ev(3, "ghezavat", "2027-01-21")];
  it("prefers the selected exam, then the book's earliest exam", () => {
    expect(pickExamEvent(events, "ghezavat", ["kanoon"], NOW)?.id).toBe(3);
    expect(pickExamEvent(events, null, ["markaz", "ghezavat"], NOW)?.id).toBe(2);
    expect(pickExamEvent(events, "unknown", ["kanoon"], NOW)?.id).toBe(1);
    expect(pickExamEvent(events, null, ["sardaftari"], NOW)).toBeNull();
    expect(pickExamEvent(events, "past", [], NOW)).toBeNull();
  });
});

describe("variants (P1-8, P1-17)", () => {
  it("never defaults to a placeholder price", () => {
    expect(defaultVariant([variant("PRINT", { price_is_placeholder: true }), variant("EBOOK")])?.type).toBe("EBOOK");
    expect(defaultVariant([variant("PRINT", { price_is_placeholder: true })])).toBeUndefined();
  });
  it("auto-selects the ebook when print is sold out, else a purchasable bundle", () => {
    expect(defaultVariant([variant("PRINT", { in_stock: false }), variant("EBOOK")])?.type).toBe("EBOOK");
    expect(
      defaultVariant([variant("PRINT", { in_stock: false }), variant("EBOOK", { price_is_placeholder: true }), variant("BUNDLE")])
        ?.type,
    ).toBe("BUNDLE");
    expect(purchasableEbook([variant("EBOOK", { price_is_placeholder: true })])).toBeUndefined();
  });
  it("delivery lines come from the store settings for print", () => {
    expect(deliveryLines("PRINT", store)).toEqual(["ارسال حداکثر ۱ روز کاری پس از سفارش", "تحویل تهران ۱ تا ۲ روز کاری"]);
    expect(deliveryLines("PRINT", null)[0]).toContain("پست");
    expect(deliveryLines("EBOOK", store)[0]).toContain("دسترسی فوری");
    expect(deliveryLines("PRINT", { ...store, free_shipping_threshold: 3000000 })[2]).toBe(
      "ارسال رایگان برای سفارش‌های بالای ۳٬۰۰۰٬۰۰۰ تومان",
    );
  });
  it("card stock note offers the ebook when print is out", () => {
    expect(cardStockNote({ formats: ["PRINT", "EBOOK"], print_in_stock: false, in_stock: true })).toBe(
      "چاپی ناموجود · الکترونیک موجود",
    );
    expect(cardStockNote({ formats: ["PRINT"], print_in_stock: false, in_stock: false })).toBeNull();
    expect(cardStockNote({ formats: ["PRINT", "EBOOK"], print_in_stock: true, in_stock: true })).toBeNull();
  });
});

describe("product meta (P1-15)", () => {
  const details = books as unknown as BookDetail[];
  const book = details[0]!;
  it("builds the title pattern, omitting missing parts", () => {
    expect(productTitle(book)).toBe("خرید کتاب حقوق مدنی دوجلدی دکتر شکری — ویرایش ۱۴۰۵");
    expect(productTitle({ ...book, authors: [], publish_year: null })).toBe("خرید کتاب حقوق مدنی دوجلدی");
  });
  it("only makes true claims in the description", () => {
    const d = productDescription(book);
    expect(d.startsWith("مناسب آزمون کانون وکلا، مرکز وکلا، قضاوت؛ نمونه رایگان؛ نسخه چاپی و الکترونیک.")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(160);
    const noSample = productDescription({ ...book, has_sample: false, exam_types: [], description: "" });
    expect(noSample).toBe("نسخه چاپی و الکترونیک.");
    const printOnly = { ...book, variants: book.variants.map((v) => ({ ...v, price_is_placeholder: v.type !== "PRINT" })) };
    expect(formatsClaim(printOnly)).toBe("نسخه چاپی");
  });
  it("JSON-LD has bookEdition/numberOfPages and no placeholder offers", () => {
    const placeholderBook = details.find((b) => b.variants.some((v) => v.price_is_placeholder))!;
    const ld = bookJsonLd(placeholderBook, "https://example.com/p");
    const offers = ([] as unknown[]).concat(ld.offers ?? []);
    expect(offers).toHaveLength(placeholderBook.variants.filter((v) => !v.price_is_placeholder).length);
    expect(bookJsonLd(book, "https://example.com/p").numberOfPages).toBe(book.pages);
    expect(bookEdition({ edition: "", edition_badge: null, publish_year: 1404 })).toBe("ویرایش ۱۴۰۴");
    expect(bookEdition({ edition: "ویرایش سوم", edition_badge: "ویرایش ۱۴۰۵", publish_year: 1405 })).toBe("ویرایش سوم");
  });
});

describe("fixtures follow the contract", () => {
  const details = books as unknown as BookDetail[];
  const h = home as unknown as HomePayload;
  it("badges: max 2, known codes/tones; quick review flag mirrors resource_type", () => {
    const cards: BookCard[] = [...details, ...h.bestsellers, ...h.quick_review];
    for (const c of cards) {
      expect(c.badges.length).toBeLessThanOrEqual(2);
      for (const b of c.badges) expect(Object.keys(BADGE_TONE_CLASS)).toContain(b.tone);
      expect(c.is_quick_review).toBe(c.resource_type === "QUICK_REVIEW");
      expect(c.has_sample).toBeTypeOf("boolean");
    }
  });
  it("bundle_saving = PRINT + EBOOK − BUNDLE when all real, else null", () => {
    for (const b of details) {
      const eff = Object.fromEntries(b.variants.filter((v) => !v.price_is_placeholder).map((v) => [v.type, v.effective_price]));
      for (const v of b.variants) {
        const expected =
          v.type === "BUNDLE" && !v.price_is_placeholder && eff.PRINT && eff.EBOOK && eff.PRINT + eff.EBOOK - v.effective_price > 0
            ? eff.PRINT + eff.EBOOK - v.effective_price
            : null;
        expect(v.bundle_saving, b.slug).toBe(expected);
      }
    }
  });
  it("home carries store settings and selected_exam_type", () => {
    expect(h.selected_exam_type).toBeNull();
    expect(h.store.print_dispatch_note).not.toBe("");
    expect(h.subjects.every((s) => s.weight === null)).toBe(true);
  });
});
