"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { ChangelogEntry } from "@/lib/platform-types";
import { apiFetch } from "@/lib/session";
import { useNavSummary } from "@/lib/nav-summary";
import { onboardingActive, onboardingAllowedOn } from "@/lib/onboarding";
import { platformRoutes, safeInboxLink } from "@/lib/platform-routes";
import { WHATS_NEW_SEEN_KEY, shouldShowWhatsNew } from "@/lib/whats-new";

/**
 * PF-17: one-time «تازه‌ها» sheet for logged-in customers after a new changelog entry
 * (flagged «نمایش در پنجره تازه‌ها» in the admin). Remembered per device.
 */
export function WhatsNewSheet() {
  const pathname = usePathname();
  const { data } = useNavSummary();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  const [open, setOpen] = useState(false);
  const loggedIn = !!data;
  // wait while the onboarding sheet is up (only right after a login)
  const busyElsewhere = !!data?.show_onboarding && onboardingActive();

  useEffect(() => {
    if (!loggedIn || busyElsewhere || !onboardingAllowedOn(pathname) || pathname === platformRoutes.changelog) return;
    let alive = true;
    void apiFetch<{ entry: ChangelogEntry | null }>("/changelog/latest/").then((res) => {
      if (!alive || !res.ok) return;
      let seen: string | null = null;
      try {
        seen = window.localStorage.getItem(WHATS_NEW_SEEN_KEY);
      } catch {
        return; // cannot remember: never nag
      }
      if (shouldShowWhatsNew(res.data.entry, seen)) {
        setEntry(res.data.entry);
        setOpen(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [loggedIn, busyElsewhere, pathname]);

  if (!entry) return null;
  const close = () => {
    try {
      window.localStorage.setItem(WHATS_NEW_SEEN_KEY, String(entry.id));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const link = safeInboxLink(entry.link);

  return (
    <Dialog open={open} onClose={close} title="تازه‌های دادرُز" placement="sheet">
      <p className="text-xs font-bold text-primary">
        {entry.area_label} · {entry.published_jalali}
      </p>
      <h3 className="mt-1 text-lg font-extrabold text-ink">{entry.title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink">{entry.body}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {link ? (
          <Link href={link} onClick={close} className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white">
            امتحانش کنید
          </Link>
        ) : (
          <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-bold text-white">
            باشه
          </button>
        )}
        <Link href={platformRoutes.changelog} onClick={close} className="inline-flex min-h-11 items-center rounded-control px-4 font-bold text-primary hover:bg-primary-soft">
          همه تازه‌ها
        </Link>
      </div>
    </Dialog>
  );
}
