"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { CloseIcon } from "@/components/ui/Icons";
import { trackInstallPrompt } from "@/lib/analytics";
import {
  INSTALL_EVENT,
  clearInstallPrompt,
  deferredInstallPrompt,
  installPlatform,
  isStandalone,
  loadDismissed,
  saveDismissed,
  type InstallPlatform,
} from "@/lib/pwa-install";
import { AddSquareIcon, PhoneDownloadIcon, ShareIosIcon } from "./PlatformIcons";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-5 text-sm font-extrabold text-ink hover:brightness-105";

/**
 * PF-14 «کتابخوان دادرُز را روی گوشی نصب کنید»: Android/Chromium uses the captured
 * `beforeinstallprompt`; iOS Safari gets an illustrated Share › Add to Home Screen sheet.
 * Hidden once installed, on unsupported browsers and for 60 days after «نه، ممنون».
 */
export function InstallPrompt({ placement }: { placement: "library" | "purchase" }) {
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
  const [hidden, setHidden] = useState(true);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const ua = window.navigator.userAgent;
      // iPadOS reports a Mac user agent; touch support tells them apart
      const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
      const p = installPlatform({
        ua: ipad ? `${ua} iPad` : ua,
        standalone: isStandalone(),
        hasPrompt: deferredInstallPrompt() != null,
      });
      setPlatform(p);
      const show = (p === "prompt" || p === "ios") && !loadDismissed();
      setHidden(!show);
      if (show) trackInstallPrompt({ platform: p, placement });
    };
    update();
    window.addEventListener(INSTALL_EVENT, update);
    return () => window.removeEventListener(INSTALL_EVENT, update);
  }, [placement]);

  if (hidden || (platform !== "prompt" && platform !== "ios")) return null;

  const dismiss = () => {
    saveDismissed();
    setHidden(true);
    trackInstallPrompt({ platform, placement, outcome: "closed" });
  };

  const install = async () => {
    if (platform === "ios") {
      setIosOpen(true);
      return;
    }
    const prompt = deferredInstallPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    clearInstallPrompt();
    trackInstallPrompt({ platform, placement, outcome: choice.outcome });
    if (choice.outcome === "accepted") setHidden(true);
    else dismiss();
  };

  return (
    <section aria-labelledby="install-title" className="relative overflow-hidden rounded-card bg-primary p-4 text-white shadow-card">
      <button
        type="button"
        onClick={dismiss}
        aria-label="بستن پیشنهاد نصب"
        className="absolute end-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <CloseIcon size={20} />
      </button>
      <div className="flex items-start gap-3 pe-8">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-ink">
          <PhoneDownloadIcon size={24} />
        </span>
        <div>
          <h2 id="install-title" className="text-base font-extrabold">
            کتابخوان دادرُز را روی گوشی نصب کنید
          </h2>
          <p className="mt-1 text-sm leading-7 text-white/85">
            یک لمس تا کتابخانه، تمام‌صفحه و بدون نوار مرورگر؛ کتاب‌های ذخیره‌شده آفلاین هم همان‌جا در دسترس است. بدون
            دانلود از استور.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={install} className={primaryBtn}>
          {platform === "ios" ? "روش نصب در آیفون" : "نصب کتابخوان"}
        </button>
        <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-white/85 hover:bg-white/10">
          نه، ممنون
        </button>
      </div>

      <Dialog open={iosOpen} onClose={() => setIosOpen(false)} title="نصب روی آیفون و آیپد" placement="sheet">
        <ol className="space-y-4">
          <li className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-soft text-primary">
              <ShareIosIcon size={26} />
            </span>
            <p className="text-sm leading-7">
              <strong>۱.</strong> در Safari دکمه <strong>اشتراک‌گذاری</strong> (مربع با فلش رو به بالا) را در پایین صفحه بزنید.
            </p>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-soft text-primary">
              <AddSquareIcon size={26} />
            </span>
            <p className="text-sm leading-7">
              <strong>۲.</strong> گزینه <strong>Add to Home Screen</strong> («افزودن به صفحه اصلی») را انتخاب کنید.
            </p>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-card bg-primary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" width={48} height={48} />
            </span>
            <p className="text-sm leading-7">
              <strong>۳.</strong> روی <strong>Add</strong> بزنید؛ نماد دادرُز روی صفحه اصلی گوشی می‌نشیند.
            </p>
          </li>
        </ol>
        <button
          type="button"
          onClick={() => {
            setIosOpen(false);
            dismiss();
          }}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-5 font-bold text-white"
        >
          متوجه شدم
        </button>
      </Dialog>
    </section>
  );
}
