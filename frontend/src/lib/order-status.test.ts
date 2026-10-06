import { describe, expect, it } from "vitest";
import {
  formatJalaliDateTime,
  formatJalaliDay,
  orderStatusLabel,
  orderStatusTone,
  orderStepIndex,
  orderSteps,
  tehranWallClock,
  timelineSteps,
} from "./order-status";
import { accountRoutes } from "./account-routes";

describe("orderStatusTone / label", () => {
  it("maps each status to a tone", () => {
    expect(orderStatusTone("PENDING_PAYMENT")).toBe("warning");
    expect(orderStatusTone("PAID")).toBe("info");
    expect(orderStatusTone("SHIPPED")).toBe("primary");
    expect(orderStatusTone("DELIVERED")).toBe("success");
    expect(orderStatusTone("FAILED")).toBe("danger");
    expect(orderStatusTone("CANCELLED")).toBe("neutral");
    expect(orderStatusTone("WHATEVER")).toBe("neutral");
  });
  it("prefers the server label", () => {
    expect(orderStatusLabel("PAID", "پرداخت‌شده!")).toBe("پرداخت‌شده!");
    expect(orderStatusLabel("PAID")).toBe("پرداخت‌شده");
    expect(orderStatusLabel("X", "")).toBe("X");
  });
});

describe("order steps", () => {
  it("skips shipping steps for ebook-only orders", () => {
    expect(orderSteps(false)).toEqual(["PENDING_PAYMENT", "PAID", "DELIVERED"]);
    expect(orderStepIndex("SHIPPED", true)).toBe(3);
    expect(orderStepIndex("SHIPPED", false)).toBe(-1);
    expect(orderStepIndex("CANCELLED")).toBe(-1);
  });

  it("adds upcoming steps after the last logged one", () => {
    const rows = timelineSteps(
      [
        { status: "PAID", label: "پرداخت‌شده", at: "2026-10-02T10:00:00Z" },
        { status: "PENDING_PAYMENT", label: "در انتظار پرداخت", at: "2026-10-02T09:58:00Z" },
      ],
      "PAID",
      true,
    );
    expect(rows.map((r) => [r.status, r.state])).toEqual([
      ["PENDING_PAYMENT", "done"],
      ["PAID", "current"],
      ["PROCESSING", "upcoming"],
      ["SHIPPED", "upcoming"],
      ["DELIVERED", "upcoming"],
    ]);
    expect(rows[2]!.at).toBeNull();
  });

  it("marks delivered as done and failures as failed without upcoming steps", () => {
    const delivered = timelineSteps(
      [
        { status: "PENDING_PAYMENT", label: "", at: "2026-10-02T09:00:00Z" },
        { status: "PAID", label: "", at: "2026-10-02T09:05:00Z" },
        { status: "DELIVERED", label: "", at: "2026-10-02T09:05:01Z" },
      ],
      "DELIVERED",
      false,
    );
    expect(delivered.map((r) => r.state)).toEqual(["done", "done", "done"]);
    expect(delivered[2]!.label).toBe("تحویل‌شده");

    const cancelled = timelineSteps(
      [
        { status: "PENDING_PAYMENT", label: "", at: "2026-10-02T09:00:00Z" },
        { status: "CANCELLED", label: "لغوشده", at: "2026-10-02T10:00:00Z" },
      ],
      "CANCELLED",
      true,
    );
    expect(cancelled.map((r) => r.state)).toEqual(["done", "failed"]);
  });

  it("falls back to the current status when the log is empty", () => {
    const rows = timelineSteps([], "PENDING_PAYMENT", false);
    expect(rows.map((r) => [r.status, r.state])).toEqual([
      ["PENDING_PAYMENT", "current"],
      ["PAID", "upcoming"],
      ["DELIVERED", "upcoming"],
    ]);
  });
});

describe("Tehran Jalali dates", () => {
  it("shifts UTC to Tehran wall-clock time", () => {
    const d = tehranWallClock("2026-10-02T18:00:00Z");
    expect([d.getHours(), d.getMinutes()]).toEqual([21, 30]);
  });
  it("rolls over the calendar day", () => {
    expect(formatJalaliDay("2026-10-02T21:00:00Z")).toBe("۱۱ مهر ۱۴۰۵");
    expect(formatJalaliDay("2026-10-02T10:00:00Z")).toBe("۱۰ مهر ۱۴۰۵");
  });
  it("formats date and time with Persian digits", () => {
    expect(formatJalaliDateTime("2026-10-02T18:00:00Z")).toBe("۱۰ مهر ۱۴۰۵، ساعت ۲۱:۳۰");
  });
});

describe("accountRoutes", () => {
  it("builds order and reader links", () => {
    expect(accountRoutes.order("DR0507114821")).toBe("/account/orders/DR0507114821");
    expect(accountRoutes.read("حقوق-مدنی")).toBe(`/read/${encodeURIComponent("حقوق-مدنی")}`);
    expect(accountRoutes.ordersPage(1)).toBe("/account/orders");
    expect(accountRoutes.ordersPage(3)).toBe("/account/orders?page=3");
  });
  it("keeps only same-site next paths", () => {
    expect(accountRoutes.login("/account/orders")).toBe("/login?next=%2Faccount%2Forders");
    expect(accountRoutes.login("//evil.com")).toBe("/login");
    expect(accountRoutes.login("https://evil.com")).toBe("/login");
    expect(accountRoutes.login(null)).toBe("/login");
  });
});
