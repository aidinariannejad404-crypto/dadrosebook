import type { Metadata } from "next";
import Link from "next/link";
import type { LibraryEntry, OrderSummary, Paginated } from "@/lib/account-types";
import { getMe, serverApiGet } from "@/lib/server-session";
import { accountRoutes } from "@/lib/account-routes";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatJalaliDay, orderStatusLabel, orderStatusTone, tehranWallClock } from "@/lib/order-status";
import { StatusPill } from "@/components/account/StatusPill";
import { ProfileForm } from "@/components/account/ProfileForm";
import { BookOpenIcon, ChatIcon, ChevronIcon, HeartIcon, MapPinIcon, PackageIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "پیشخوان", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

function greeting(): string {
  const h = tehranWallClock(new Date()).getHours();
  return h >= 4 && h < 12 ? "صبح بخیر" : h >= 12 && h < 17 ? "روز بخیر" : "عصر بخیر";
}

export default async function AccountDashboard() {
  const [me, orders, library] = await Promise.all([
    getMe(),
    safe(serverApiGet<Paginated<OrderSummary>>("/orders/")),
    safe(serverApiGet<LibraryEntry[]>("/library/")),
  ]);
  if (!me) return null; // the layout already handled anonymous visitors

  const latest = orders?.results.slice(0, 3) ?? [];
  const pending = orders?.results.filter((o) => o.status === "PENDING_PAYMENT").length ?? 0;
  const links = [
    { href: accountRoutes.orders, label: "سفارش‌ها", note: orders ? `${toPersianDigits(orders.count)} سفارش` : "", Icon: PackageIcon },
    { href: accountRoutes.library, label: "کتابخانه من", note: library ? `${toPersianDigits(library.length)} کتاب الکترونیک` : "", Icon: BookOpenIcon },
    { href: accountRoutes.addresses, label: "نشانی‌ها", note: "مدیریت نشانی‌های ارسال", Icon: MapPinIcon },
    { href: accountRoutes.wishlist, label: "علاقه‌مندی‌ها", note: "کتاب‌هایی که نشان کرده‌اید", Icon: HeartIcon },
    { href: accountRoutes.reviews, label: "نظرات من", note: "وضعیت نظرهای ثبت‌شده", Icon: ChatIcon },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface p-4 shadow-card md:p-6">
        <h1 className="text-xl font-black text-ink">
          {greeting()}
          {me.first_name ? `، ${me.first_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          شماره موبایل: <bdi>{toPersianDigits(me.phone)}</bdi>
        </p>
        <div className="mt-2">
          <ProfileForm me={me} />
        </div>
      </section>

      {pending > 0 && (
        <p className="rounded-control bg-warning-soft px-4 py-3 text-sm font-bold leading-7 text-warning">
          {toPersianDigits(pending)} سفارش در انتظار پرداخت دارید.{" "}
          <Link href={accountRoutes.orders} className="underline underline-offset-4">
            مشاهده و پرداخت
          </Link>
        </p>
      )}

      <section aria-labelledby="latest-orders">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="latest-orders" className="text-lg font-extrabold text-ink">
            آخرین سفارش‌ها
          </h2>
          {latest.length > 0 && (
            <Link
              href={accountRoutes.orders}
              className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
            >
              همه سفارش‌ها
              <ChevronIcon size={18} />
            </Link>
          )}
        </div>
        {orders == null ? (
          <p className="rounded-card bg-surface p-4 text-sm text-ink-muted">فهرست سفارش‌ها فعلاً در دسترس نیست.</p>
        ) : latest.length === 0 ? (
          <p className="rounded-card bg-surface p-4 text-sm leading-7 text-ink-muted">
            هنوز سفارشی ثبت نکرده‌اید.{" "}
            <Link href="/" className="font-bold text-primary underline underline-offset-4">
              دیدن کتاب‌ها
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
            {latest.map((o) => (
              <li key={o.number}>
                <Link
                  href={accountRoutes.order(o.number)}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-primary-soft"
                >
                  <span className="font-bold text-ink">
                    <bdi>{o.number}</bdi>
                  </span>
                  <StatusPill tone={orderStatusTone(o.status)}>{orderStatusLabel(o.status, o.status_label)}</StatusPill>
                  <span className="text-xs text-ink-muted">{formatJalaliDay(o.created_at)}</span>
                  <span className="ms-auto text-sm font-bold text-ink">{formatToman(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="mb-3 text-lg font-extrabold text-ink">
          دسترسی سریع
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(({ href, label, note, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-11 items-center gap-3 rounded-card bg-surface p-4 shadow-card hover:shadow-raised"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-ink">{label}</span>
                  {note && <span className="block text-xs text-ink-muted">{note}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
