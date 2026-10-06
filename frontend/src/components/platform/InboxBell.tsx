"use client";

import Link from "next/link";
import { BellIcon } from "@/components/ui/Icons";
import { unreadBadge, useNavSummary } from "@/lib/nav-summary";
import { platformRoutes } from "@/lib/platform-routes";
import { toPersianDigits } from "@/lib/format";

/** PF-2: header bell to «پیام‌های من» with the unread count (logged-in visitors only). */
export function InboxBell() {
  const { data } = useNavSummary();
  if (!data) return null;
  const badge = unreadBadge(data.unread);
  return (
    <Link
      prefetch={false}
      href={platformRoutes.messages}
      aria-label={data.unread > 0 ? `پیام‌های من، ${toPersianDigits(data.unread)} پیام خوانده‌نشده` : "پیام‌های من"}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-primary-soft"
    >
      <BellIcon size={24} />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute end-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.6875rem] font-extrabold leading-5 text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
