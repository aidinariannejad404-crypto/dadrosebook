import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { decodeSlug, getCampaign } from "@/lib/api";
import { routes } from "@/lib/config";
import { formatJalaliDate, formatToman } from "@/lib/format";
import { campaignPath, campaignStateAt, type CampaignState } from "@/lib/growth";
import { DEFAULT_OPEN_GRAPH, NOINDEX_FOLLOW } from "@/lib/seo";
import { BookCard } from "@/components/book/BookCard";
import { CampaignCountdown } from "@/components/growth/CampaignCountdown";
import { CampaignViewTracker } from "@/components/growth/CampaignViewTracker";
import { CalendarIcon, TicketIcon } from "@/components/ui/Icons";

/**
 * و۶: exam-calendar campaign landing — hero with countdown, the auto-applied discount, eligible books.
 * ISR (60 s); the countdown and state are re-evaluated in the browser.
 */
export const revalidate = 60;

type Params = Promise<{ slug: string }>;

const load = cache(async (slug: string) => getCampaign(decodeSlug(slug)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: "کمپین پیدا نشد" };
  const description = c.subtitle || c.description.slice(0, 160) || `کتاب‌های منتخب ${c.title}`;
  const path = campaignPath(c.slug);
  return {
    title: c.discount_label ? `${c.title} — ${c.discount_label}` : c.title,
    description,
    alternates: { canonical: path },
    // an ended campaign stays reachable for old links but leaves the index
    robots: c.state === "ended" ? NOINDEX_FOLLOW : undefined,
    openGraph: {
      ...DEFAULT_OPEN_GRAPH,
      title: c.title,
      description,
      url: path,
      images: c.hero_image ? [{ url: c.hero_image, alt: c.title }] : undefined,
    },
  };
}

const STATE_TEXT: Record<CampaignState, string> = {
  upcoming: "به‌زودی شروع می‌شود",
  active: "در حال برگزاری",
  ended: "این کمپین به پایان رسیده است",
};

export default async function CampaignPage({ params }: { params: Params }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const now = Date.now();
  const state = campaignStateAt(c, now);
  const heroStyle = c.hero_color ? { background: c.hero_color } : undefined;

  return (
    <div className="mx-auto max-w-site px-4 pb-10 pt-4 md:pt-6">
      <CampaignViewTracker slug={c.slug} state={state} />
      <nav aria-label="مسیر صفحه" className="mb-3 text-sm text-ink-muted">
        <Link href={routes.home} className="inline-flex min-h-11 items-center hover:text-primary">
          خانه
        </Link>
        <span aria-hidden="true" className="mx-1.5">
          /
        </span>
        <span aria-current="page">{c.title}</span>
      </nav>

      <section
        aria-labelledby="campaign-title"
        style={heroStyle}
        className="relative overflow-hidden rounded-card bg-primary px-5 py-6 text-white shadow-card md:px-8 md:py-8"
      >
        <div className="md:flex md:items-end md:justify-between md:gap-8">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              <CalendarIcon size={16} />
              {STATE_TEXT[state]}
            </p>
            <h1 id="campaign-title" className="mt-3 text-2xl font-black leading-10 md:text-3xl">
              {c.title}
            </h1>
            {c.subtitle && <p className="mt-2 text-base leading-8 text-white/90">{c.subtitle}</p>}
            {c.discount_label && state !== "ended" && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 font-black text-ink">
                <TicketIcon size={20} />
                {c.discount_label} روی کتاب‌های این صفحه
              </p>
            )}
            {c.exam_event && (
              <p className="mt-3 text-sm text-white/85">
                {c.exam_event.name}: {formatJalaliDate(c.exam_event.date)}
              </p>
            )}
          </div>
          <div className="mt-5 shrink-0 md:mt-0">
            {state === "upcoming" && <CampaignCountdown iso={c.starts_at} serverNow={now} label="تا شروع کمپین" />}
            {state === "active" && <CampaignCountdown iso={c.ends_at} serverNow={now} label="تا پایان کمپین" />}
            <p className="mt-2 text-xs text-white/80">
              {formatJalaliDate(c.starts_at)} تا {formatJalaliDate(c.ends_at)}
            </p>
          </div>
        </div>
      </section>

      {state === "active" && c.discount_label && (
        <p className="mt-4 rounded-control bg-success-soft px-4 py-3 text-sm font-bold leading-7 text-success">
          تخفیف به‌طور خودکار در سبد خرید و صفحه پرداخت اعمال می‌شود؛ نیازی به کد تخفیف نیست.
          {c.min_order_total > 0 && <> برای سفارش‌های بالای {formatToman(c.min_order_total)} از کتاب‌های این کمپین.</>}
        </p>
      )}

      {c.description && (
        <div className="mt-6 max-w-3xl whitespace-pre-line leading-8 text-ink">{c.description}</div>
      )}

      <section aria-labelledby="campaign-books" className="mt-8">
        <h2 id="campaign-books" className="text-lg font-black text-ink md:text-xl">
          کتاب‌های کمپین
        </h2>
        {c.books.length === 0 ? (
          <p className="mt-3 text-ink-muted">کتابی برای این کمپین ثبت نشده است.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            {c.books.map((book, i) => (
              <li key={book.id}>
                <BookCard book={book} priority={i < 2} showNotify />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
