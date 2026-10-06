import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGift } from "@/lib/api";
import { SITE_NAME, siteUrl } from "@/lib/config";
import { NOINDEX } from "@/lib/seo";
import { SHORT_LABEL } from "@/lib/variants";
import { PrintButton } from "@/components/growth/PrintButton";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = { title: "کارت هدیه", robots: NOINDEX };

/** و۴: printable gift card (A5-ish, black on white when printed) with the claim link written out. */
export default async function GiftCardPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) notFound();
  const gift = await getGift(token).catch(() => null);
  if (!gift) notFound();
  const link = `${siteUrl()}/gift/${token}`;
  return (
    <div className="px-4 py-6 print:p-0">
      {/* print only the card: hide the site chrome (header, tab bar, footer) */}
      <style>{"@media print { header, footer, nav { display: none !important; } }"}</style>
      <article className="mx-auto max-w-lg rounded-card border-4 border-double border-accent bg-surface p-6 text-center shadow-card print:max-w-none print:shadow-none">
        <p className="text-sm font-bold tracking-wide text-ink-muted">{SITE_NAME}</p>
        <h1 className="mt-3 text-2xl font-black leading-10 text-ink">
          {gift.recipient_name ? `${gift.recipient_name} عزیز` : "هدیه‌ای برای شما"}
        </h1>
        {gift.message && <p className="mx-auto mt-4 max-w-sm leading-8 text-ink">«{gift.message}»</p>}
        <p className="mt-4 font-bold text-ink">از طرف {gift.sender_name}</p>
        <ul className="mx-auto mt-5 max-w-sm space-y-1 border-y border-line py-3 text-sm text-ink">
          {gift.items.map((it, i) => (
            <li key={i}>
              {it.title} <span className="text-ink-muted">({SHORT_LABEL[it.variant_type]})</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm leading-7 text-ink">برای دریافت هدیه این نشانی را باز کنید و با شماره موبایل خودتان وارد شوید:</p>
        <p dir="ltr" className="mt-2 break-all rounded-control bg-bg px-3 py-2 font-mono text-sm font-bold text-ink">
          {link}
        </p>
      </article>
      <div className="mx-auto mt-4 max-w-lg print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
