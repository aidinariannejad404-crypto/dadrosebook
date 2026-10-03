import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderSummary, Paginated } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { accountRoutes } from "@/lib/account-routes";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatJalaliDay, orderStatusLabel, orderStatusTone } from "@/lib/order-status";
import { StatusPill } from "@/components/account/StatusPill";
import { MiniCover } from "@/components/account/MiniCover";
import { EmptyState } from "@/components/account/EmptyState";
import { ChevronIcon, PackageIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "سفارش‌ها", robots: { index: false, follow: false } };

type SearchParams = Promise<{ page?: string | string[] }>;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).page;
  const page = Math.max(1, Number.parseInt(Array.isArray(raw) ? (raw[0] ?? "1") : (raw ?? "1"), 10) || 1);
  const data = await serverApiGet<Paginated<OrderSummary>>(`/orders/${page > 1 ? `?page=${page}` : ""}`);
  if (!data) {
    if (page > 1) notFound();
    return <p className="rounded-card bg-surface p-4 text-ink-muted">فهرست سفارش‌ها در دسترس نیست.</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-ink">سفارش‌ها</h1>
      {data.results.length === 0 ? (
        <EmptyState icon={<PackageIcon size={40} />} title="هنوز سفارشی ثبت نکرده‌اید" href="/" action="دیدن کتاب‌ها">
          سفارش‌های شما و وضعیت ارسالشان اینجا نمایش داده می‌شود.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.results.map((o) => (
            <li key={o.number}>
              <Link
                href={accountRoutes.order(o.number)}
                className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-raised sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-ink">
                      <span className="sr-only">سفارش </span>
                      <bdi>{o.number}</bdi>
                    </span>
                    <StatusPill tone={orderStatusTone(o.status)}>{orderStatusLabel(o.status, o.status_label)}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    <time dateTime={o.created_at}>{formatJalaliDay(o.created_at)}</time> ·{" "}
                    {toPersianDigits(o.items_count)} قلم
                  </p>
                  <p className="mt-2 font-bold text-ink">{formatToman(o.total)}</p>
                </div>
                <div className="flex items-end gap-2" aria-hidden="true">
                  {o.covers.slice(0, 3).map((c, i) => (
                    <MiniCover key={i} title={c.title} cover={c.cover} color={c.subject_color} className="w-11" />
                  ))}
                  {o.items_count > 3 && (
                    <span className="mb-2 text-xs font-bold text-ink-muted">+{toPersianDigits(o.items_count - 3)}</span>
                  )}
                  <ChevronIcon size={20} className="mb-3 ms-1 text-ink-muted" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(data.previous || data.next) && (
        <nav aria-label="صفحه‌بندی سفارش‌ها" className="mt-6 flex items-center justify-between gap-2">
          {data.previous ? (
            <Link
              href={accountRoutes.ordersPage(page - 1)}
              rel="prev"
              className="inline-flex min-h-11 items-center rounded-control bg-surface px-4 font-bold text-primary shadow-card hover:bg-primary-soft"
            >
              صفحه قبل
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">صفحه {toPersianDigits(page)}</span>
          {data.next ? (
            <Link
              href={accountRoutes.ordersPage(page + 1)}
              rel="next"
              className="inline-flex min-h-11 items-center rounded-control bg-surface px-4 font-bold text-primary shadow-card hover:bg-primary-soft"
            >
              صفحه بعد
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
