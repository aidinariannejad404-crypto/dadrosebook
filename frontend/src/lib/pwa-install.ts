/**
 * PF-14: «کتابخوان دادرُز را روی گوشی نصب کنید». Android/Chromium fires `beforeinstallprompt`
 * (captured early by PwaInstallListener in the root layout); iOS Safari needs Share › Add to Home
 * Screen, explained in an illustrated sheet. A dismissal is remembered for 60 days.
 */

export type InstallPlatform = "prompt" | "ios" | "installed" | "unsupported";

export const INSTALL_DISMISS_KEY = "dadrose.install.dismissed";
export const INSTALL_DISMISS_DAYS = 60;
export const INSTALL_EVENT = "dadrose:install-available";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

/** Called once from the layout listener: keep the browser's prompt for our own button. */
export function captureInstallPrompt(e: Event): void {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event(INSTALL_EVENT));
}

export function deferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function clearInstallPrompt(): void {
  deferred = null;
}

export function isIos(ua: string): boolean {
  // iPadOS 13+ reports "Macintosh"; it is told apart by touch support in the component.
  return /iPhone|iPad|iPod/i.test(ua);
}

/** In-app browsers (Instagram, Telegram…) and iOS Chrome/Firefox cannot add to the home screen. */
export function isIosSafari(ua: string): boolean {
  return isIos(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|Telegram|FBAN|FBAV/i.test(ua);
}

export function installPlatform({
  ua,
  standalone,
  hasPrompt,
}: {
  ua: string;
  standalone: boolean;
  hasPrompt: boolean;
}): InstallPlatform {
  if (standalone) return "installed";
  if (hasPrompt) return "prompt";
  if (isIosSafari(ua)) return "ios";
  return "unsupported";
}

export function isDismissed(raw: string | null, now = Date.now()): boolean {
  const at = Number(raw);
  if (!raw || !Number.isFinite(at)) return false;
  return now - at < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function loadDismissed(): boolean {
  try {
    return isDismissed(window.localStorage.getItem(INSTALL_DISMISS_KEY));
  } catch {
    return false;
  }
}

export function saveDismissed(now = Date.now()): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    /* storage blocked: the card shows again next visit */
  }
}

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}
