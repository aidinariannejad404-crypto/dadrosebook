import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Order } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { POST_TRACKING_URL, accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatJalaliDateTime, orderStatusLabel, orderStatusTone } from "@/lib/order-status";
import { StatusPill } from "@/components/account/StatusPill";
import { MiniCover } from "@/components/account/MiniCover";
import { OrderTimeline } from "@/components/account/OrderTimeline";
import { CopyButton } from "@/components/account/CopyButton";
import { PayButton } from "@/components/account/PayButton";
import { BookOpenIcon, ChevronIcon, ExternalIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

type Params = Promise<{ number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { number } = await params;
  return { title: `سفارش ${decodeURIComponent(number)}`, robots: { index: false, follow: false } };
}

const CARD = "rounded-card bg-surface p-4 shadow-card md:p-5";

export default async function OrderDetailPage({ params }: { params: Params }) {
  const { number: raw } = await params;
  const number = decodeURIComponent(raw);
  const order = await serverApiGet<Order>(`/orders/${encodeURIComponent(number)}/`);
  if (!order) notFound();

  const addr = order.shipping_address;

  return (
    <div className="space-y-4">
      <Link
        href={accountRoutes.orders}
        className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
      >
        <ChevronIcon size={18} className="rotate-180" />
        همه سفارش‌ها
      </Link>

      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-black text-ink">
            سفارش <bdi>{order.number}</bdi>
          </h1>
          <StatusPill tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status, order.status_label)}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          ثبت: <time dateTime={order.created_at}>{formatJalaliDateTime(order.created_at)}</time>
          {order.paid_at && (
            <>
              {" · "}پرداخت: <time dateTime={order.paid_at}>{formatJalaliDateTime(order.paid_at)}</time>
            </>
          )}
        </p>
        {order.can_pay && (
          <div className="mt-4 rounded-control bg-warning-soft p-3">
            <p className="mb-3 text-sm font-bold leading-7 text-warning">
              این سفارش هنوز پرداخت نشده است. با پرداخت، سفارش شما نهایی می‌شود.
            </p>
            <PayButton number={order.number} />
          </div>
        )}
      </section>

      <section aria-labelledby="items-title" className={CARD}>
        <h2 id="items-title" className="mb-3 font-extrabold text-ink">
          اقلام سفارش
        </h2>
        <ul className="divide-y divide-line">
          {order.items.map((it, i) => (
            <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <MiniCover title={it.title} cover={it.cover} color={it.subject_color} className="w-14" />
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-7 text-ink">
                  {it.book_slug ? (
                    <Link href={routes.product(it.book_slug)} className="hover:underline">
                      {it.title}
                    </Link>
                  ) : (
                    it.title
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {it.variant_type_label}، تعداد {toPersianDigits(it.quantity)} × {formatToman(it.unit_price)}
                  {it.list_price > it.unit_price && (
                    <>
                      {" "}
                      <s className="text-ink-muted">
                        <span className="sr-only">قیمت پیش از تخفیف: </span>
                        {formatToman(it.list_price)}
                      </s>
                    </>
                  )}
                </p>
                <p className="mt-1 text-sm font-bold text-ink">{formatToman(it.line_total)}</p>
                {it.can_read && it.book_slug && (
                  <Link
                    href={accountRoutes.read(it.book_slug)}
                    className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
                  >
                    <BookOpenIcon size={18} />
                    مطالعه
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">جمع اقلام</dt>
            <dd className="text-ink">{formatToman(order.items_total)}</dd>
          </div>
          {order.discount_total > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">
                تخفیف
                {order.discount_code && (
                  <>
                    {" "}
                    (<bdi dir="ltr">{order.discount_code}</bdi>)
                  </>
                )}
              </dt>
              <dd className="font-bold text-success">− {formatToman(order.discount_total)}</dd>
            </div>
          )}
          {order.needs_shipping && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">هزینه ارسال</dt>
              <dd className="text-ink">{order.shipping_total > 0 ? formatToman(order.shipping_total) : "رایگان"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-line pt-2 text-base">
            <dt className="font-bold text-ink">مبلغ پرداختی</dt>
            <dd className="font-black text-ink">{formatToman(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="timeline-title" className={CARD}>
          <h2 id="timeline-title" className="mb-4 font-extrabold text-ink">
            وضعیت سفارش
          </h2>
          <OrderTimeline order={order} />
        </section>

        <div className="space-y-4">
          {order.needs_shipping && (
            <section aria-labelledby="ship-title" className={CARD}>
              <h2 id="ship-title" className="mb-3 font-extrabold text-ink">
                ارسال
              </h2>
              {order.shipping_method_name && (
                <p className="text-sm text-ink">
                  روش ارسال: <strong>{order.shipping_method_name}</strong>
                </p>
              )}
              {addr && (
                <address className="mt-2 text-sm not-italic leading-7 text-ink">
                  {addr.recipient_name}، <bdi>{toPersianDigits(addr.recipient_phone)}</bdi>
                  <br />
                  {addr.province}، {addr.city}، {toPersianDigits(addr.address_line)}
                  <br />
                  کد پستی: <bdi>{toPersianDigits(addr.postal_code)}</bdi>
                </address>
              )}
              {order.tracking_code && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm text-ink-muted">کد رهگیری مرسوله</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wider text-ink" dir="ltr">
                    {order.tracking_code}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CopyButton value={order.tracking_code} label="کد رهگیری" />
                    <a
                      href={POST_TRACKING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft"
                    >
                      پیگیری مرسوله
                      <ExternalIcon size={16} />
                      <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
                    </a>
                  </div>
                </div>
              )}
            </section>
          )}

          {order.payment && (
            <section aria-labelledby="pay-title" className={CARD}>
              <h2 id="pay-title" className="mb-3 font-extrabold text-ink">
                پرداخت
              </h2>
              <dl className="space-y-1 text-sm">
                {order.payment.ref_id && (
                  <div className="flex flex-wrap gap-1">
                    <dt className="text-ink-muted">شماره پیگیری پرداخت:</dt>
                    <dd className="font-bold text-ink">
                      <bdi>{toPersianDigits(order.payment.ref_id)}</bdi>
                    </dd>
                  </div>
                )}
                {order.payment.card_pan && (
                  <div className="flex flex-wrap gap-1">
                    <dt className="text-ink-muted">کارت:</dt>
                    <dd className="text-ink">
                      <bdi dir="ltr">{toPersianDigits(order.payment.card_pan)}</bdi>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {order.customer_note && (
            <section aria-labelledby="note-title" className={CARD}>
              <h2 id="note-title" className="mb-2 font-extrabold text-ink">
                یادداشت شما
              </h2>
              <p className="whitespace-pre-line text-sm leading-7 text-ink">{order.customer_note}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
