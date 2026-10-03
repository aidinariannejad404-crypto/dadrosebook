import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUE_MAX,
  _queuedEventsForTests,
  _resetAnalyticsForTests,
  flushAnalyticsQueue,
  sanitizeParams,
  track,
  trackAddToCart,
  trackBeginCheckout,
  trackCourseCrossSellClick,
  trackKitBuilt,
  trackNotifyMeRequested,
  trackPurchase,
  trackStudyPlanRequested,
  trackViewItem,
  type AnalyticsDetail,
} from "./analytics";

type Sent = [string, Record<string, unknown>];

class FakeStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

interface FakeWindow extends EventTarget {
  dataLayer?: unknown[];
  umami?: { track: (e: string, d?: Record<string, unknown>) => void };
  sessionStorage: FakeStorage;
}

let win: FakeWindow;
let domEvents: AnalyticsDetail[];

function installUmami(): Sent[] {
  const sent: Sent[] = [];
  win.umami = { track: (e, d) => void sent.push([e, d ?? {}]) };
  return sent;
}

beforeEach(() => {
  vi.useFakeTimers();
  process.env.NEXT_PUBLIC_UMAMI_SRC = "https://stats.example.com/script.js";
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "site-id";
  win = Object.assign(new EventTarget(), { sessionStorage: new FakeStorage() }) as FakeWindow;
  domEvents = [];
  win.addEventListener("dadrose:analytics", (e) => domEvents.push((e as CustomEvent<AnalyticsDetail>).detail));
  vi.stubGlobal("window", win);
  _resetAnalyticsForTests();
});

afterEach(() => {
  _resetAnalyticsForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_UMAMI_SRC;
  delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
});

describe("track", () => {
  it("is a no-op on the server", () => {
    vi.unstubAllGlobals();
    expect(() => track("view_item", { item_id: 1 })).not.toThrow();
  });

  it("dispatches the DOM event, pushes to dataLayer and sends to Umami", () => {
    win.dataLayer = [];
    const sent = installUmami();
    track("view_item", { item_id: 1, item_name: "کتاب", price: 120000 });
    const params = { item_id: 1, item_name: "کتاب", price: 120000, currency: "TOMAN" };
    expect(domEvents).toEqual([{ event: "view_item", params }]);
    expect(win.dataLayer).toEqual([{ event: "view_item", ...params }]);
    expect(sent).toEqual([["view_item", params]]);
  });

  it("still dispatches the DOM event when Umami is not configured, and queues nothing", () => {
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    track("kit_built", { books: 3 });
    expect(domEvents).toHaveLength(1);
    expect(_queuedEventsForTests()).toBe(0);
  });

  it("queues before the script loads (max 50) and flushes when window.umami appears", () => {
    for (let i = 0; i < QUEUE_MAX + 5; i++) track("view_item", { item_id: i });
    expect(_queuedEventsForTests()).toBe(QUEUE_MAX);
    const sent = installUmami();
    vi.advanceTimersByTime(600);
    expect(_queuedEventsForTests()).toBe(0);
    expect(sent).toHaveLength(QUEUE_MAX);
    expect(sent[0]![1].item_id).toBe(5); // oldest dropped
    expect(sent.at(-1)![1].item_id).toBe(QUEUE_MAX + 4);
  });

  it("flushAnalyticsQueue (script onLoad) sends queued events in order before new ones", () => {
    track("view_item", { item_id: 1 });
    const sent = installUmami();
    flushAnalyticsQueue();
    track("view_item", { item_id: 2 });
    expect(sent.map(([, d]) => d.item_id)).toEqual([1, 2]);
  });

  it("never throws when Umami throws", () => {
    win.umami = {
      track: () => {
        throw new Error("boom");
      },
    };
    expect(() => track("view_item", { item_id: 1 })).not.toThrow();
  });
});

describe("sanitizeParams", () => {
  it("strips personal data and empty values", () => {
    expect(
      sanitizeParams({
        phone: "09121234567",
        mobile_number: "x",
        name: "علی",
        full_name: "علی رضایی",
        email: "a@b.c",
        shipping_address: "تهران",
        item_name: "کتاب مدنی",
        note: "۰۹۱۲۱۲۳۴۵۶۷",
        empty: undefined,
        nil: null,
        ok: 1,
      }),
    ).toEqual({ item_name: "کتاب مدنی", ok: 1 });
  });

  it("adds currency TOMAN only to money events", () => {
    expect(sanitizeParams({ value: 10 })).toEqual({ value: 10, currency: "TOMAN" });
    expect(sanitizeParams({ items: 2 })).toEqual({ items: 2 });
  });
});

describe("typed helpers", () => {
  it("trackViewItem / trackAddToCart", () => {
    trackViewItem({ item_id: 7, item_name: "ب", price: null, subject: "مدنی" });
    trackAddToCart({ item_id: 7, item_name: "ب", variant: "PRINT", price: 100, quantity: 2, source: "sticky" });
    expect(domEvents[0]).toEqual({ event: "view_item", params: { item_id: 7, item_name: "ب", subject: "مدنی" } });
    expect(domEvents[1]!.params).toEqual({
      item_id: 7,
      item_name: "ب",
      variant: "PRINT",
      price: 100,
      quantity: 2,
      source: "sticky",
      value: 200,
      currency: "TOMAN",
    });
  });

  it("trackBeginCheckout flattens formats", () => {
    trackBeginCheckout({ value: 500, items: 3, formats: ["PRINT", "EBOOK", "PRINT"] });
    expect(domEvents[0]!.params).toEqual({ value: 500, items: 3, formats: "EBOOK,PRINT", currency: "TOMAN" });
  });

  it("trackPurchase sends once per order_number (sessionStorage dedupe)", () => {
    const order = { order_number: "DB-1001", value: 900, items: 2, formats: ["BUNDLE" as const], has_bundle: true };
    trackPurchase(order);
    trackPurchase(order);
    expect(domEvents).toHaveLength(1);
    expect(win.sessionStorage.getItem("dadrose:purchase:DB-1001")).toBe("1");
    // a reload (fresh module state) still sees sessionStorage
    _resetAnalyticsForTests();
    trackPurchase(order);
    expect(domEvents).toHaveLength(1);
    trackPurchase({ ...order, order_number: "DB-1002", discount_code: "OFF10" });
    expect(domEvents[1]!.params).toMatchObject({ order_number: "DB-1002", discount_code: "OFF10", has_bundle: true });
  });

  it("kit, notify-me, course click and study plan", () => {
    trackKitBuilt({ exam_type: "vekalat", subjects: 4, books: 9, value: 3_000_000 });
    trackNotifyMeRequested({ item_id: 1, item_name: "ب", variant: "PRINT" });
    trackCourseCrossSellClick({ course_id: 5, course_title: "دوره", book_slug: "x", placement: "more" });
    trackStudyPlanRequested({ exam_type: "vekalat", subjects: ["a", "b"], hours_per_day: 4, book: null });
    expect(domEvents.map((e) => e.event)).toEqual([
      "kit_built",
      "notify_me_requested",
      "course_cross_sell_click",
      "study_plan_requested",
    ]);
    expect(domEvents[0]!.params.currency).toBe("TOMAN");
    expect(domEvents[2]!.params).toEqual({ course_id: 5, course_title: "دوره", book_slug: "x", placement: "more" });
    expect(domEvents[3]!.params).toEqual({ exam_type: "vekalat", subjects: "a,b", subjects_count: 2, hours_per_day: 4 });
  });
});
