/** Package «د» (impl/trust): ownership (د۱), delivery promise (د۲), start studying (د۳), readiness (د۴). */
import { describe, expect, it } from "vitest";
import { duplicateWarning, ownedBadge, ownedBanner, ownedIdsIn, ownedMap, purchasedOn, uncheckBooks } from "./owned";
import { clashFor, clashesWithExam, isShipped, promiseText } from "./delivery";
import { booksLabel, examLine, readFirstAction, shippingLine } from "./start-studying";
import { daysLeftText, missingVariantIds, percentValue, readinessPercent, readText, subjectStatus } from "./readiness";
import type { DeliveryEstimate, DeliverySummary, OwnedBook, ReadinessSubject } from "./trust-types";

const owned = (over: Partial<OwnedBook> = {}): OwnedBook => ({
  book_id: 1,
  slug: "madani",
  title: "حقوق مدنی",
  formats: ["PRINT"],
  can_read: false,
  purchased_at: "2026-10-02T18:00:00Z", // 21:30 Tehran, 10 Mehr
  order_number: "DR-1",
  ...over,
});

const est = (min: string, max: string): DeliveryEstimate => ({
  dispatch_date: min,
  min_date: min,
  max_date: max,
  label: "پنجشنبه ۱۶ مهر تا یکشنبه ۱۹ مهر",
});

describe("د۱ ownership", () => {
  it("banner: ebook owners continue reading, print owners see the Jalali purchase day", () => {
    expect(ownedBanner(owned({ formats: ["EBOOK"], can_read: true }))).toEqual({
      kind: "read",
      text: "در کتابخانه شما",
      action: "ادامه مطالعه",
    });
    expect(ownedBanner(owned())).toEqual({ kind: "bought", text: "این کتاب را در ۱۰ مهر ۱۴۰۵ خریدید", action: "مشاهده سفارش" });
    expect(ownedBanner(owned({ purchased_at: null, order_number: null }))?.text).toBe("این کتاب را قبلاً خریده‌اید");
    expect(ownedBanner(undefined)).toBeNull();
    expect(ownedBanner(owned({ formats: [] }))).toBeNull();
  });

  it("uses the Tehran calendar day for the purchase date", () => {
    expect(purchasedOn(owned({ purchased_at: "2026-10-02T21:00:00Z" }))).toBe("۱۱ مهر ۱۴۰۵");
  });

  it("warns only when a format is repeated", () => {
    const ebook = owned({ formats: ["EBOOK"], can_read: true });
    expect(duplicateWarning(ebook, "EBOOK")).toContain("در کتابخانه شما هست");
    expect(duplicateWarning(ebook, "BUNDLE")).toContain("«چاپی»");
    expect(duplicateWarning(ebook, "PRINT")).toBeNull(); // print on top of an ebook is normal
    expect(duplicateWarning(owned(), "PRINT")).toBe("نسخه چاپی این کتاب را در ۱۰ مهر ۱۴۰۵ خریده‌اید.");
    expect(duplicateWarning(owned(), "EBOOK")).toBeNull();
    expect(duplicateWarning(undefined, "EBOOK")).toBeNull();
  });

  it("kit: finds owned ids and unchecks them, keeping formats", () => {
    const map = ownedMap([owned(), owned({ book_id: 3, formats: ["EBOOK"] })]);
    expect(ownedIdsIn([1, 2, 3], map)).toEqual([1, 3]);
    const sel = { books: { 1: true, 2: true, 3: false }, formats: { 1: 10, 2: 20 } };
    const next = uncheckBooks(sel, [1, 3]);
    expect(next.books).toEqual({ 1: false, 2: true, 3: false });
    expect(next.formats).toBe(sel.formats);
    expect(uncheckBooks(sel, [])).toBe(sel);
    expect(ownedBadge(map.get(3))).toBe("در کتابخانه شما");
    expect(ownedBadge(map.get(1))).toBe("خریده‌اید");
  });
});

describe("د۲ delivery promise", () => {
  it("only print formats are shipped", () => {
    expect(isShipped("PRINT")).toBe(true);
    expect(isShipped("BUNDLE")).toBe(true);
    expect(isShipped("EBOOK")).toBe(false);
    expect(isShipped(undefined)).toBe(false);
  });

  it("formats the promise", () => {
    expect(promiseText(est("2026-10-08", "2026-10-11"))).toBe("تحویل تقریبی: پنجشنبه ۱۶ مهر تا یکشنبه ۱۹ مهر");
    expect(promiseText(null)).toBeNull();
  });

  it("clash when the latest date is after exam − 7 days (same rule as the backend)", () => {
    const e = est("2026-10-08", "2026-10-11");
    expect(clashesWithExam(e, "2026-10-18")).toBe(false);
    expect(clashesWithExam(e, "2026-10-17")).toBe(true);
    expect(clashesWithExam(e, null)).toBe(false);
    expect(clashesWithExam(null, "2026-10-17")).toBe(false);
  });

  it("clashFor builds a message from the summary's exam", () => {
    const summary: DeliverySummary = {
      estimate: null,
      methods: [],
      exam: { name: "آزمون کانون ۱۴۰۵", slug: "kanoon", date: "2026-10-15", days_left: 10, safe_until: "2026-10-08" },
      exam_clash: null,
    };
    expect(clashFor(summary, est("2026-10-05", "2026-10-08"))).toBeNull();
    const clash = clashFor(summary, est("2026-10-08", "2026-10-11"));
    expect(clash?.exam_name).toBe("آزمون کانون ۱۴۰۵");
    expect(clash?.message).toContain("نسخه الکترونیک");
    expect(clashFor(null, est("2026-10-08", "2026-10-11"))).toBeNull();
  });
});

describe("د۳ start studying", () => {
  it("shipping line prefers the promised window", () => {
    expect(shippingLine({ needs_shipping: false, delivery_estimate: null })).toBeNull();
    expect(shippingLine({ needs_shipping: true, delivery_estimate: est("2026-10-08", "2026-10-11") })).toBe(
      "تحویل تقریبی نسخه چاپی: پنجشنبه ۱۶ مهر تا یکشنبه ۱۹ مهر",
    );
    expect(shippingLine({ needs_shipping: true })).toContain("کد رهگیری");
  });

  it("lists the plan's books briefly", () => {
    expect(booksLabel([])).toBe("");
    expect(booksLabel([{ title: "الف" }])).toBe("«الف»");
    expect(booksLabel([{ title: "الف" }, { title: "ب" }])).toBe("«الف» و «ب»");
    expect(booksLabel([{ title: "الف" }, { title: "ب" }, { title: "ج" }, { title: "د" }])).toBe("«الف»، «ب» و ۲ کتاب دیگر");
  });

  it("reader action and exam line", () => {
    const base = { id: 1, slug: "x", title: "x", cover: null, subject_color: null, reader_url: "/read/x" };
    expect(readFirstAction({ ...base, percent_read: 0 })).toBe("شروع مطالعه از صفحه ۱");
    expect(readFirstAction({ ...base, percent_read: 12 })).toBe("ادامه مطالعه");
    expect(readFirstAction(null)).toBe("");
    const exam = { slug: "k", name: "کانون وکلا", event_name: "آزمون کانون ۱۴۰۵", date: "2026-11-14", days_left: 40 };
    expect(examLine({ exam })).toBe("۴۰ روز تا آزمون کانون ۱۴۰۵");
    expect(examLine({ exam: { ...exam, days_left: 0 } })).toBe("آزمون کانون ۱۴۰۵ امروز است");
    expect(examLine({ exam: { ...exam, days_left: null, event_name: null } })).toBeNull();
    expect(examLine(null)).toBeNull();
  });
});

describe("د۴ readiness", () => {
  const subject = (over: Partial<ReadinessSubject> = {}): ReadinessSubject => ({
    subject: { id: 1, name: "مدنی", slug: "madani", color: "#1F4E8C" },
    weight: 4,
    essential_total: 3,
    essential_owned: 2,
    ready: false,
    percent_read: 40,
    books: [],
    ...over,
  });

  it("status text and tone", () => {
    expect(subjectStatus(subject())).toEqual({ text: "۲ از ۳ منبع ضروری", tone: "warning" });
    expect(subjectStatus(subject({ essential_owned: 3, ready: true })).tone).toBe("success");
    expect(subjectStatus(subject({ essential_owned: 0 })).tone).toBe("neutral");
  });

  it("percent and reading text", () => {
    expect(percentValue(41.6)).toBe(42);
    expect(percentValue(140)).toBe(100);
    expect(percentValue(null)).toBe(0);
    expect(readText(null)).toBeNull();
    expect(readText(0)).toBe("هنوز شروع نکرده‌اید");
    expect(readText(40.2)).toBe("۴۰٪ خوانده‌شده");
    expect(readinessPercent(5, 7)).toBe(71);
    expect(readinessPercent(0, 0)).toBe(0);
  });

  it("days left and missing variants (deduplicated)", () => {
    expect(daysLeftText({ slug: "k", name: "کانون", event_name: null, date: "2026-11-14", days_left: 3 })).toBe("۳ روز تا کانون");
    expect(daysLeftText(null)).toBeNull();
    const book = (id: number, owned: boolean, variant: number | null) => ({
      id,
      slug: `b${id}`,
      title: `b${id}`,
      cover: null,
      subject_color: null,
      owned,
      formats: owned ? (["PRINT"] as const).slice() : [],
      percent_read: null,
      buy_variant: variant ? { id: variant, type: "PRINT" as const, type_label: "چاپی", price: 1000 } : null,
    });
    const subjects = [
      subject({ books: [book(1, true, null), book(2, false, 20), book(3, false, null)] }),
      subject({ books: [book(2, false, 20), book(4, false, 40)] }),
    ];
    expect(missingVariantIds(subjects)).toEqual([20, 40]);
  });
});
