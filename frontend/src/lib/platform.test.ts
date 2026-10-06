import { describe, expect, it } from "vitest";
import { libraryTabEnabled, unreadBadge } from "./nav-summary";
import { initialProfileInput, onboardingAllowedOn, readExamCookie, toggleSubject } from "./onboarding";
import { INSTALL_DISMISS_DAYS, installPlatform, isDismissed, isIosSafari } from "./pwa-install";
import {
  READER_FONTS,
  fontFamilyFor,
  persianDigitsText,
  persianizeDigits,
  restoreDigits,
  sanitizeTypography,
  type DigitOriginals,
  type TextLike,
} from "./reader-typography";
import { shouldShowWhatsNew } from "./whats-new";
import { cleanTrackingCode, isTopic, isTrackingCode, ticketTone } from "./support";
import { officialChannelsText, officialDomain } from "./official-channels";
import { otpHelpVisible } from "./otp-help";
import { platformRoutes, safeInboxLink } from "./platform-routes";
import type { NavSummary } from "./platform-types";

const summary = (patch: Partial<NavSummary> = {}): NavSummary => ({
  unread: 0,
  has_library: false,
  continue_reading: null,
  show_onboarding: false,
  exam_type: null,
  ...patch,
});

describe("nav summary (PF-2 / PF-9)", () => {
  it("swaps in the library tab only for ebook owners", () => {
    expect(libraryTabEnabled(null)).toBe(false);
    expect(libraryTabEnabled(summary())).toBe(false);
    expect(libraryTabEnabled(summary({ has_library: true }))).toBe(true);
  });
  it("formats the unread badge", () => {
    expect(unreadBadge(0)).toBe("");
    expect(unreadBadge(undefined)).toBe("");
    expect(unreadBadge(7)).toBe("۷");
    expect(unreadBadge(150)).toBe("۹۹+");
  });
});

describe("onboarding (PF-8)", () => {
  it("is never shown on checkout, reader or login", () => {
    expect(onboardingAllowedOn("/")).toBe(true);
    expect(onboardingAllowedOn("/account")).toBe(true);
    expect(onboardingAllowedOn("/checkout")).toBe(false);
    expect(onboardingAllowedOn("/checkout/result")).toBe(false);
    expect(onboardingAllowedOn("/read/x")).toBe(false);
    expect(onboardingAllowedOn("/reader-guide")).toBe(true);
  });
  it("keeps at most three weak subjects, dropping the oldest", () => {
    expect(toggleSubject([], "a")).toEqual(["a"]);
    expect(toggleSubject(["a", "b", "c"], "d")).toEqual(["b", "c", "d"]);
    expect(toggleSubject(["a", "b"], "a")).toEqual(["b"]);
  });
  it("prefills the exam from the cookie when there is no profile", () => {
    expect(initialProfileInput(null, "vekalat")).toEqual({ exam_type: "vekalat", exam_year: null, exam_date: null, weak_subjects: [] });
    const profile = { exam_type: "ghezavat", exam_type_name: "قضاوت", exam_year: 1405, exam_date: null, weak_subjects: ["madani"], completed: true };
    expect(initialProfileInput(profile, "vekalat").exam_type).toBe("ghezavat");
  });
  it("reads the exam cookie", () => {
    expect(readExamCookie("a=1; exam=%D9%88%DA%A9%D8%A7%D9%84%D8%AA; b=2")).toBe("وکالت");
    expect(readExamCookie("a=1")).toBeNull();
    expect(readExamCookie("exam=<script>")).toBeNull();
  });
});

describe("install prompt (PF-14)", () => {
  const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const iosChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/128 Mobile/15E148 Safari/604.1";
  const instagram = `${iphone} Instagram 300.0`;

  it("picks the platform", () => {
    expect(installPlatform({ ua: android, standalone: false, hasPrompt: true })).toBe("prompt");
    expect(installPlatform({ ua: android, standalone: false, hasPrompt: false })).toBe("unsupported");
    expect(installPlatform({ ua: iphone, standalone: false, hasPrompt: false })).toBe("ios");
    expect(installPlatform({ ua: iphone, standalone: true, hasPrompt: false })).toBe("installed");
    expect(installPlatform({ ua: iosChrome, standalone: false, hasPrompt: false })).toBe("unsupported");
  });
  it("only offers the iOS sheet in Safari", () => {
    expect(isIosSafari(iphone)).toBe(true);
    expect(isIosSafari(instagram)).toBe(false);
    expect(isIosSafari(android)).toBe(false);
  });
  it("remembers a dismissal for a while", () => {
    const now = Date.UTC(2026, 9, 5);
    expect(isDismissed(null, now)).toBe(false);
    expect(isDismissed("junk", now)).toBe(false);
    expect(isDismissed(String(now - 1000), now)).toBe(true);
    expect(isDismissed(String(now - (INSTALL_DISMISS_DAYS + 1) * 86_400_000), now)).toBe(false);
  });
});

describe("reader typography (PF-6)", () => {
  it("sanitises saved preferences", () => {
    expect(sanitizeTypography(null)).toEqual({ font: "vazirmatn", persianDigits: false });
    expect(sanitizeTypography({ font: "naskh", persianDigits: true })).toEqual({ font: "naskh", persianDigits: true });
    expect(sanitizeTypography({ font: "comic-sans", persianDigits: "yes" })).toEqual({ font: "vazirmatn", persianDigits: false });
  });
  it("maps fonts to families (self-hosted Vazirmatn first)", () => {
    expect(READER_FONTS[0]?.value).toBe("vazirmatn");
    expect(fontFamilyFor("vazirmatn")).toContain("--font-vazirmatn");
    expect(fontFamilyFor("naskh")).toContain("Naskh");
  });
  it("converts digits without changing length", () => {
    const s = "ماده 10 قانون 1403";
    expect(persianDigitsText(s)).toBe("ماده ۱۰ قانون ۱۴۰۳");
    expect(persianDigitsText(s)).toHaveLength(s.length);
  });
  it("walks text nodes, skips code and can restore", () => {
    const text = (v: string): TextLike => ({ nodeType: 3, nodeValue: v });
    const a = text("ماده 12");
    const code = text("x = 5");
    const b = text("بدون رقم");
    const root: TextLike = {
      nodeType: 1,
      nodeValue: null,
      nodeName: "DIV",
      childNodes: [a, { nodeType: 1, nodeValue: null, nodeName: "CODE", childNodes: [code] }, b],
    };
    const originals: DigitOriginals = new Map();
    expect(persianizeDigits(root, originals)).toBe(1);
    expect(a.nodeValue).toBe("ماده ۱۲");
    expect(code.nodeValue).toBe("x = 5");
    expect(restoreDigits(originals)).toBe(1);
    expect(a.nodeValue).toBe("ماده 12");
    expect(persianizeDigits(null)).toBe(0);
  });
});

describe("what's new sheet (PF-17)", () => {
  const now = Date.UTC(2026, 9, 5);
  const entry = { id: 5, published_at: "2026-10-01" };
  it("shows a recent entry once", () => {
    expect(shouldShowWhatsNew(entry, null, now)).toBe(true);
    expect(shouldShowWhatsNew(entry, "4", now)).toBe(true);
    expect(shouldShowWhatsNew(entry, "5", now)).toBe(false);
    expect(shouldShowWhatsNew(null, null, now)).toBe(false);
  });
  it("does not announce old entries", () => {
    expect(shouldShowWhatsNew({ id: 6, published_at: "2026-06-01" }, null, now)).toBe(false);
  });
});

describe("support (PF-11)", () => {
  it("cleans tracking codes", () => {
    expect(cleanTrackingCode("۱۲۳۴ ۵۶۷۸")).toBe("12345678");
    expect(cleanTrackingCode("1234-56789")).toBe("12345678");
    expect(isTrackingCode("12345678")).toBe(true);
    expect(isTrackingCode("1234567")).toBe(false);
  });
  it("knows topics and tones", () => {
    expect(isTopic("ebook")).toBe(true);
    expect(isTopic("x")).toBe(false);
    expect(ticketTone("open")).toBe("warning");
    expect(ticketTone("answered")).toBe("success");
    expect(ticketTone("closed")).toBe("neutral");
  });
  it("builds support routes", () => {
    expect(platformRoutes.support()).toBe("/support");
    expect(platformRoutes.support({ order: "DR1", source: "order" })).toBe("/support?order=DR1&source=order");
    expect(platformRoutes.track("12345678")).toBe("/support/track?code=12345678");
  });
});

describe("inbox links and official channels (PF-2 / PF-3)", () => {
  it("follows same-site paths only", () => {
    expect(safeInboxLink("/account/orders/DR1")).toBe("/account/orders/DR1");
    expect(safeInboxLink("//evil.com")).toBeNull();
    expect(safeInboxLink("https://evil.com")).toBeNull();
    expect(safeInboxLink("")).toBeNull();
  });
  it("names the domain and the SMS line", () => {
    expect(officialDomain("https://www.dadrosebook.com")).toBe("dadrosebook.com");
    expect(officialChannelsText("https://dadrosebook.com", "")).toContain("dadrosebook.com");
    expect(officialChannelsText("https://dadrosebook.com", "3000123")).toContain("۳۰۰۰۱۲۳");
  });
});

describe("OTP help (PF-1)", () => {
  it("appears 60 seconds after sending", () => {
    expect(otpHelpVisible(null, 1_000_000)).toBe(false);
    expect(otpHelpVisible(1_000_000, 1_059_000)).toBe(false);
    expect(otpHelpVisible(1_000_000, 1_060_000)).toBe(true);
  });
});
