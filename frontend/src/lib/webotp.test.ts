import { describe, expect, it, vi } from "vitest";
import { receiveSmsCode, webOtpSupported } from "./webotp";

describe("webotp", () => {
  it("detects support from OTPCredential", () => {
    expect(webOtpSupported({ OTPCredential: class {} })).toBe(true);
    expect(webOtpSupported({})).toBe(false);
    expect(webOtpSupported(undefined)).toBe(false);
  });

  it("requests an sms otp credential and returns the cleaned code", async () => {
    const get = vi.fn().mockResolvedValue({ code: "۱۲۳۴۵" });
    const ac = new AbortController();
    await expect(receiveSmsCode(ac.signal, 5, { supported: true, get })).resolves.toBe("12345");
    expect(get).toHaveBeenCalledWith({ otp: { transport: ["sms"] }, signal: ac.signal });
  });

  it("returns null when unsupported, aborted, rejected or the wrong length", async () => {
    const ac = new AbortController();
    const get = vi.fn().mockResolvedValue({ code: "123" });
    expect(await receiveSmsCode(ac.signal, 5, { supported: false, get })).toBeNull();
    expect(await receiveSmsCode(ac.signal, 5, { supported: true, get })).toBeNull();
    const reject = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    expect(await receiveSmsCode(ac.signal, 5, { supported: true, get: reject })).toBeNull();
    ac.abort();
    const never = vi.fn();
    expect(await receiveSmsCode(ac.signal, 5, { supported: true, get: never })).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
