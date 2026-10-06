import type { Metadata } from "next";
import Link from "next/link";
import type { Paginated } from "@/lib/account-types";
import type { InboxItem, PersonalCode } from "@/lib/platform-types";
import { serverApiGet } from "@/lib/server-session";
import { formatJalaliDateTime, formatJalaliDay } from "@/lib/order-status";
import { platformRoutes, safeInboxLink } from "@/lib/platform-routes";
import { CopyButton } from "@/components/account/CopyButton";
import { EmptyState } from "@/components/account/EmptyState";
import { StatusPill } from "@/components/account/StatusPill";
import { BellIcon, ChevronIcon, TicketIcon } from "@/components/ui/Icons";
import { MarkInboxRead } from "@/components/platform/MarkInboxRead";
import { SlidersIcon } from "@/components/platform/PlatformIcons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "پیام‌های من", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** PF-2 «پیام‌های من»: every store SMS also lands here, plus «کدهای تخفیف من». */
export default async function MessagesPage() {
  const [page, codes] = await Promise.all([
    safe(serverApiGet<Paginated<InboxItem>>("/inbox/")),
    safe(serverApiGet<PersonalCode[]>("/inbox/codes/")),
  ]);
  const items = page?.results ?? [];
  const unread = items.filter((i) => !i.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-ink">پیام‌های من</h1>
        <Link
          href={platformRoutes.notifications}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft"
        >
          <SlidersIcon size={18} />
          تنظیم اعلان‌ها
        </Link>
      </div>
      <MarkInboxRead unread={unread} />

      {codes && codes.length > 0 && (
        <section aria-labelledby="my-codes" className="rounded-card bg-surface p-4 shadow-card">
          <h2 id="my-codes" className="flex items-center gap-2 text-base font-extrabold text-ink">
            <TicketIcon size={20} className="text-primary" />
            کدهای تخفیف من
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {codes.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <bdi dir="ltr" className="rounded-control bg-bg px-2 py-1 font-mono text-sm font-bold text-ink">
                  {c.code}
                </bdi>
                <StatusPill tone={c.is_valid ? "success" : "neutral"}>{c.is_valid ? "قابل استفاده" : "منقضی یا غیرفعال"}</StatusPill>
                <span className="text-xs text-ink-muted">
                  {c.title}
                  {c.valid_until ? ` · اعتبار تا ${formatJalaliDay(c.valid_until)}` : ""}
                </span>
                {c.is_valid && (
                  <span className="ms-auto">
                    <CopyButton value={c.code} label="کپی کد" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {page == null ? (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">پیام‌ها فعلاً در دسترس نیست.</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<BellIcon size={36} />} title="هنوز پیامی ندارید" href="/" action="دیدن کتاب‌ها" headingLevel={2}>
          پیامک‌های سفارش، ارسال، «موجود شد خبرم کن» و پاسخ پشتیبانی هم اینجا نگه داشته می‌شوند تا گم نشوند.
        </EmptyState>
      ) : (
        <ul aria-label="فهرست پیام‌ها" className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
          {items.map((item) => {
            const link = safeInboxLink(item.link);
            const body = (
              <>
                <span className="flex flex-wrap items-center gap-2">
                  {!item.is_read && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] font-extrabold text-ink">تازه</span>
                  )}
                  <span className="font-bold text-ink">{item.title}</span>
                  <time dateTime={item.created_at} className="text-xs text-ink-muted">
                    {formatJalaliDateTime(item.created_at)}
                  </time>
                </span>
                <span className="mt-1 block whitespace-pre-line text-sm leading-7 text-ink">{item.body}</span>
              </>
            );
            return (
              <li key={item.id}>
                {link ? (
                  <Link href={link} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-soft">
                    <span className="min-w-0 flex-1">{body}</span>
                    <ChevronIcon size={18} className="shrink-0 text-ink-muted" />
                  </Link>
                ) : (
                  <div className="px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
