"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/session";
import { accountRoutes } from "@/lib/account-routes";
import {
  BookOpenIcon,
  CalendarIcon,
  ChatIcon,
  ClockIcon,
  DevicesIcon,
  GridIcon,
  HeartIcon,
  LogoutIcon,
  MapPinIcon,
  PackageIcon,
} from "@/components/ui/Icons";

const ITEMS = [
  { href: accountRoutes.dashboard, label: "پیشخوان", Icon: GridIcon, exact: true },
  { href: accountRoutes.orders, label: "سفارش‌ها", Icon: PackageIcon },
  { href: accountRoutes.library, label: "کتابخانه من", Icon: BookOpenIcon },
  // --- retention stream ---
  { href: accountRoutes.plan, label: "برنامه مطالعه", Icon: CalendarIcon },
  { href: accountRoutes.report, label: "کارنامه مطالعه", Icon: ClockIcon },
  // --- end retention stream ---
  { href: accountRoutes.devices, label: "دستگاه‌های من", Icon: DevicesIcon },
  { href: accountRoutes.addresses, label: "نشانی‌ها", Icon: MapPinIcon },
  { href: accountRoutes.wishlist, label: "علاقه‌مندی‌ها", Icon: HeartIcon },
  { href: accountRoutes.reviews, label: "نظرات من", Icon: ChatIcon },
];

/** Account sections: horizontally scrollable tabs on mobile, a side nav (start side) from md up. */
export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    const res = await apiFetch<void>("/auth/logout/", { method: "POST" });
    if (!res.ok && res.status !== 401) {
      setBusy(false);
      setError("خروج انجام نشد. دوباره تلاش کنید.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <nav aria-label="حساب کاربری" className="md:sticky md:top-4">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:rounded-card md:bg-surface md:p-2 md:shadow-card">
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0 snap-start">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control px-4 text-sm font-bold transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "bg-surface text-ink shadow-card hover:bg-primary-soft md:bg-transparent md:shadow-none"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 snap-start md:mt-1 md:border-t md:border-line md:pt-1">
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control bg-surface px-4 text-sm font-bold text-danger shadow-card hover:bg-danger-soft disabled:opacity-60 md:bg-transparent md:shadow-none"
          >
            <LogoutIcon size={18} className="shrink-0" />
            {busy ? "در حال خروج…" : "خروج"}
          </button>
        </li>
      </ul>
      <p role="status" aria-live="polite" className="mt-1 text-xs font-bold text-danger empty:hidden">
        {error}
      </p>
    </nav>
  );
}
