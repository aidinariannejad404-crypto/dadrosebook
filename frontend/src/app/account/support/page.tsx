import type { Metadata } from "next";
import Link from "next/link";
import type { TicketSummary } from "@/lib/platform-types";
import { serverApiGet } from "@/lib/server-session";
import { platformRoutes } from "@/lib/platform-routes";
import { formatJalaliDay } from "@/lib/order-status";
import { toPersianDigits } from "@/lib/format";
import { ticketTone } from "@/lib/support";
import { EmptyState } from "@/components/account/EmptyState";
import { StatusPill } from "@/components/account/StatusPill";
import { ChevronIcon } from "@/components/ui/Icons";
import { SupportIcon } from "@/components/platform/PlatformIcons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "درخواست‌های پشتیبانی", robots: { index: false, follow: false } };

export default async function AccountSupportPage() {
  let rows: TicketSummary[] | null = null;
  try {
    rows = await serverApiGet<TicketSummary[]>("/support/tickets/");
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-ink">درخواست‌های پشتیبانی</h1>
        <Link
          href={platformRoutes.support({ source: "account" })}
          className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
        >
          درخواست تازه
        </Link>
      </div>
      {rows == null ? (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-muted shadow-card">فعلاً در دسترس نیست.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<SupportIcon size={36} />} title="درخواستی ثبت نکرده‌اید" href={platformRoutes.support({ source: "account" })} action="ثبت درخواست" headingLevel={2}>
          مشکل سفارش، کتاب الکترونیک یا پرداخت را اینجا ثبت کنید؛ پاسخ پیامک می‌شود و همین‌جا می‌ماند.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
          {rows.map((t) => (
            <li key={t.tracking_code}>
              <Link href={platformRoutes.accountTicket(t.tracking_code)} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-primary-soft">
                <span className="font-bold text-ink">{t.subject}</span>
                <StatusPill tone={ticketTone(t.status)}>{t.status_label}</StatusPill>
                <span className="text-xs text-ink-muted">
                  <bdi dir="ltr">{toPersianDigits(t.tracking_code)}</bdi> · {formatJalaliDay(t.created_at)}
                </span>
                <ChevronIcon size={18} className="ms-auto text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
