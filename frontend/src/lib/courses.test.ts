import { describe, expect, it } from "vitest";
import { courseLink, isEmptyOffer, orderTiers, priceWithCode, recommendedRibbon, taughtByAuthor } from "./courses";
import { normalizeMobile } from "./phone";
import { fixtureStudyPlan, groupByWeek, studyPlanErrors, weekStart } from "./study-plan";
import type { BookDetail, Course, CourseOffer, ExamEvent, TierCourse } from "./types";
import books from "./__fixtures__/books.json";
import events from "./__fixtures__/exam-events.json";

const details = books as unknown as BookDetail[];
const nemoudari = details.find((b) => b.slug === "حقوق-مدنی-نموداری")!;

describe("courseLink (UTM)", () => {
  it("adds the referral UTM with the book slug as utm_content", () => {
    const u = new URL(courseLink("https://dadrose.com/courses/civil-law-books-2-to-8/?ref=x", "حقوق-مدنی-نموداری"));
    expect(u.searchParams.get("utm_source")).toBe("dadrosebook");
    expect(u.searchParams.get("utm_medium")).toBe("referral");
    expect(u.searchParams.get("utm_campaign")).toBe("book_course");
    expect(u.searchParams.get("utm_content")).toBe("حقوق-مدنی-نموداری");
    expect(u.searchParams.get("ref")).toBe("x");
    expect(u.pathname).toBe("/courses/civil-law-books-2-to-8/");
  });
  it("keeps percent-encoded Persian paths and replaces existing UTM values", () => {
    const url = "https://dadrose.com/courses/%d8%af%d9%88%d8%b1%d9%87/?utm_source=old";
    const out = courseLink(url, "book");
    expect(out.startsWith("https://dadrose.com/courses/%d8%af%d9%88%d8%b1%d9%87/?")).toBe(true);
    expect(new URL(out).searchParams.getAll("utm_source")).toEqual(["dadrosebook"]);
  });
  it("returns invalid URLs unchanged", () => {
    expect(courseLink("not a url", "x")).toBe("not a url");
  });
});

const tier = (id: number, t: TierCourse["tier"], rec: boolean, type: Course["course_type"] = "FULL"): TierCourse =>
  ({ id, tier: t, is_recommended: rec, course_type: type }) as TierCourse;

describe("orderTiers", () => {
  it("orders best → better → good (anchoring) and keeps the API's recommended flag", () => {
    const out = orderTiers([tier(3, "good", false), tier(2, "better", true), tier(1, "best", false)]);
    expect(out.map((t) => t.tier)).toEqual(["best", "better", "good"]);
    expect(out.map((t) => t.is_recommended)).toEqual([false, true, false]);
  });
  it("keeps at most one recommended card and at most three tiers", () => {
    const out = orderTiers([tier(1, "best", true), tier(2, "better", true), tier(3, "good", true), tier(4, "good", false)]);
    expect(out).toHaveLength(3);
    expect(out.filter((t) => t.is_recommended).map((t) => t.id)).toEqual([1]);
  });
  it("falls back to recommended_type when nothing is flagged", () => {
    const out = orderTiers([tier(1, "best", false, "FULL"), tier(2, "better", false, "ESSENTIALS")], "ESSENTIALS");
    expect(out.map((t) => t.is_recommended)).toEqual([false, true]);
    expect(orderTiers([tier(1, "best", false)], null).some((t) => t.is_recommended)).toBe(false);
  });
  it("renders the ribbon with Persian digits", () => {
    expect(recommendedRibbon(33)).toBe("پیشنهاد ما برای ۳۳ روز مانده");
    expect(recommendedRibbon(null)).toBe("پیشنهاد ما");
    expect(recommendedRibbon(0)).toBe("پیشنهاد ما");
  });
});

describe("course helpers", () => {
  it("matches the teacher to the book author loosely", () => {
    expect(taughtByAuthor({ teachers: ["امین بیات"] }, [{ name: "استاد امين بيات" }])).toBe(true);
    expect(taughtByAuthor({ teachers: ["سجاد یوسفی"] }, [{ name: "امین بیات" }])).toBe(false);
  });
  it("rounds the price with a percent code", () => {
    expect(priceWithCode(2_980_000, 15)).toBe(2_533_000);
    expect(priceWithCode(0, 15)).toBeNull();
    expect(priceWithCode(1_000_000, null)).toBeNull();
  });
  it("treats an empty offer as nothing to show", () => {
    expect(isEmptyOffer(null)).toBe(true);
    expect(
      isEmptyOffer({ highlight: null, tiers: [], more: [], free_sample: null, discount: null } as unknown as CourseOffer),
    ).toBe(true);
    expect(isEmptyOffer(nemoudari.course_offer)).toBe(false);
  });
});

describe("normalizeMobile", () => {
  it.each([
    ["09121234567", "09121234567"],
    ["۰۹۱۲۱۲۳۴۵۶۷", "09121234567"],
    ["٠٩١٢١٢٣٤٥٦٧", "09121234567"],
    ["۰۹۱۲ ۱۲۳ ۴۵۶۷", "09121234567"],
    ["0912-123-4567", "09121234567"],
    ["+989121234567", "09121234567"],
    ["00989121234567", "09121234567"],
    ["989121234567", "09121234567"],
    ["9121234567", "09121234567"],
  ])("accepts %s", (input, out) => {
    expect(normalizeMobile(input)).toBe(out);
  });
  it.each(["", "0912123456", "091212345678", "02112345678", "۰۸۱۲۱۲۳۴۵۶۷", "abc09121234567"])("rejects %s", (input) => {
    expect(normalizeMobile(input)).toBeNull();
  });
});

describe("groupByWeek", () => {
  const day = (date: string) => ({ date, items: [] });
  it("starts weeks on Saturday", () => {
    expect(weekStart("2026-10-03")).toBe("2026-10-03"); // Saturday
    expect(weekStart("2026-10-09")).toBe("2026-10-03"); // Friday
    expect(weekStart("2026-10-02")).toBe("2026-09-26"); // Friday before
  });
  it("groups consecutive days and numbers the weeks", () => {
    const days = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-09", "2026-10-10", "2026-10-20"].map(day);
    const weeks = groupByWeek(days);
    expect(weeks.map((w) => [w.index, w.start, w.days.map((d) => d.date)])).toEqual([
      [1, "2026-09-26", ["2026-10-02"]],
      [2, "2026-10-03", ["2026-10-03", "2026-10-04", "2026-10-09"]],
      [3, "2026-10-10", ["2026-10-10"]],
      [4, "2026-10-17", ["2026-10-20"]],
    ]);
    expect(groupByWeek([])).toEqual([]);
  });
});

describe("studyPlanErrors", () => {
  it("keeps Persian field errors and maps unknown keys to the form", () => {
    expect(studyPlanErrors(400, { phone: ["شماره موبایل معتبر نیست."], non_field_errors: ["x"] })).toEqual({
      phone: "شماره موبایل معتبر نیست.",
      form: "ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید.",
    });
  });
  it("replaces English messages and explains throttling", () => {
    expect(studyPlanErrors(400, { consent: ["This field is required."] }).consent).toMatch(/موافقت/);
    expect(studyPlanErrors(429, { detail: "Request was throttled." }).form).toMatch(/کمی بعد/);
    expect(studyPlanErrors(502, null).form).toMatch(/سرور/);
  });
});

describe("fixture study plan", () => {
  const exam = (events as unknown as ExamEvent[])[0]!;
  const civil = details.filter((b) => b.subjects[0]?.slug === "حقوق-مدنی");
  const now = Date.parse("2026-10-02T09:00:00Z");
  it("returns null for a non-UUID token (→ 404)", () => {
    expect(fixtureStudyPlan("nope", now, civil, exam, [])).toBeNull();
  });
  it("covers every page before the review days, ending the day before the exam", () => {
    const plan = fixtureStudyPlan("8f1c2a4e-3b5d-4c6e-9f70-1a2b3c4d5e6f", now, civil, exam, [])!;
    const read = plan.days.flatMap((d) => d.items).reduce((s, i) => s + i.pages_to - i.pages_from + 1, 0);
    expect(read).toBe(plan.summary.total_pages);
    expect(plan.days[0]!.date).toBe("2026-10-02");
    expect(plan.review[plan.review.length - 1]!.date).toBe("2026-11-04");
    expect(plan.exam?.days_left).toBe(33);
  });
});

describe("fixtures: course_offer follows the contract", () => {
  it("has a highlight by the author, three tiers best→good and one recommended", () => {
    const o = nemoudari.course_offer!;
    expect(o.highlight?.teachers).toContain("امین بیات");
    expect(o.tiers.map((t) => t.tier)).toEqual(["best", "better", "good"]);
    expect(o.tiers.filter((t) => t.is_recommended)).toHaveLength(1);
    expect(o.discount?.code).toBe("MADANI15");
    expect(o.free_sample?.video_url).toBe("https://www.aparat.com/v/nssk9vk");
  });
  it("only shows honest social proof", () => {
    for (const b of details) {
      const o = b.course_offer;
      const all = o ? [o.highlight, ...o.tiers, ...o.more].filter(Boolean) : [];
      for (const c of all as Course[]) {
        if (c.students_count != null) expect(c.students_count).toBeGreaterThanOrEqual(100);
        if (c.rating != null) expect(c.reviews_count >= 3 && c.rating >= 4.5).toBe(true);
        if (c.is_free) expect(c.price_per_hour).toBeNull();
      }
    }
  });
});
