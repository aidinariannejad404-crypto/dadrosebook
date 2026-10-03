import { describe, expect, it } from "vitest";
import {
  cleanCode,
  digitsOnly,
  formatCountdown,
  isValidPhone,
  loginHref,
  maskPhone,
  normalizePhone,
  safeNext,
  toAsciiDigits,
} from "./otp";

describe("digits", () => {
  it("converts Persian and Arabic-Indic digits", () => {
    expect(toAsciiDigits("۰۹۱۲٣٤٥")).toBe("0912345");
    expect(digitsOnly(" ۱۲-۳۴ ab")).toBe("1234");
  });
  it("cleans OTP codes to the given length", () => {
    expect(cleanCode("۱۲ ۳۴۵۶۷", 5)).toBe("12345");
    expect(cleanCode("abc", 5)).toBe("");
  });
});

describe("normalizePhone (mirrors apps/accounts/phone.py)", () => {
  it.each([
    ["۰۹۱۲ ۰۰۰ ۰۰۰۰", "09120000000"],
    ["+989120000000", "09120000000"],
    ["00989120000000", "09120000000"],
    ["9120000000", "09120000000"],
    ["989120000000", "09120000000"],
    ["0912-123-4567", "09121234567"],
  ])("%s → %s", (raw, out) => {
    expect(normalizePhone(raw)).toBe(out);
    expect(isValidPhone(normalizePhone(raw))).toBe(true);
  });
  it("keeps invalid digits and flags them", () => {
    expect(normalizePhone("02112345678")).toBe("02112345678");
    expect(isValidPhone("02112345678")).toBe(false);
    expect(isValidPhone("0912123456")).toBe(false);
    expect(normalizePhone(null)).toBe("");
  });
});

describe("display", () => {
  it("masks phones with Persian digits", () => {
    expect(maskPhone("09121234567")).toBe("۰۹۱۲•••۴۵۶۷");
  });
  it("formats countdowns", () => {
    expect(formatCountdown(65)).toBe("۰۱:۰۵");
    expect(formatCountdown(0)).toBe("۰۰:۰۰");
    expect(formatCountdown(-3)).toBe("۰۰:۰۰");
    expect(formatCountdown(119.2)).toBe("۰۲:۰۰");
  });
});

describe("safeNext", () => {
  it("accepts same-site relative paths", () => {
    expect(safeNext("/checkout?variant=1")).toBe("/checkout?variant=1");
    expect(safeNext("/account/orders")).toBe("/account/orders");
  });
  it.each([
    null,
    undefined,
    "",
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "account",
    "/a\nb",
    "/login",
    "/login?next=/x",
  ])("rejects %s", (bad) => {
    expect(safeNext(bad as string | null | undefined)).toBe("/account");
  });
  it("uses the given fallback", () => {
    expect(safeNext("//x", "/")).toBe("/");
  });
  it("builds login links", () => {
    expect(loginHref("/checkout?variant=1")).toBe("/login?next=%2Fcheckout%3Fvariant%3D1");
    expect(loginHref("//evil")).toBe("/login");
    expect(loginHref()).toBe("/login");
  });
});
