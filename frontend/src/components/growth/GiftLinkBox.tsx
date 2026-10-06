"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackGiftLinkShared } from "@/lib/analytics";
import { formatJalaliDate } from "@/lib/format";
import { GIFT_STATE_LABEL, giftShareText, type OwnedGift } from "@/lib/growth";
import { apiFetch } from "@/lib/session";
import { PrinterIcon } from "@/components/ui/Icons";
import { ShareLinks } from "./ShareLinks";

/**
 * و۴: on the payment result and order pages of a gift order — the one-time claim link to send, share
 * intents and the printable card. Renders nothing for normal orders.
 */
export function GiftLinkBox({ orderNumber }: { orderNumber: string }) {
  const [gift, setGift] = useState<OwnedGift | null>(null);
  useEffect(() => {
    if (!orderNumber) return;
    let alive = true;
    void apiFetch<OwnedGift>(`/growth/gifts/orders/${encodeURIComponent(orderNumber)}/`).then((r) => {
      if (alive && r.ok) setGift(r.data);
    });
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  if (!gift) return null;
  return (
    <section aria-labelledby="gift-link-title" className="mt-5 rounded-card border-2 border-accent bg-accent-soft p-4 text-start">
      <h2 id="gift-link-title" className="text-base font-black text-ink">
        لینک هدیه {gift.recipient_name ? `برای ${gift.recipient_name}` : ""}
      </h2>
      <p className="mt-1 text-sm leading-7 text-ink">
        وضعیت: <span className="font-bold">{GIFT_STATE_LABEL[gift.state]}</span>
        {gift.state === "active" && gift.expires_at && <> · مهلت دریافت تا {formatJalaliDate(gift.expires_at)}</>}
      </p>
      {gift.claim_url && gift.state === "active" ? (
        <>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            این لینک یک‌بارمصرف است؛ فقط برای خود گیرنده بفرستید. او با شماره موبایلش وارد می‌شود
            {gift.needs_address ? " و نشانی ارسال را ثبت می‌کند." : " و کتاب به کتابخانه‌اش اضافه می‌شود."}
          </p>
          <ShareLinks
            url={gift.claim_url}
            text={giftShareText(gift)}
            className="mt-3"
            onShare={(channel) => trackGiftLinkShared({ channel })}
          />
          <Link
            href={`/gift/${encodeURIComponent(gift.token)}/card`}
            target="_blank"
            onClick={() => trackGiftLinkShared({ channel: "print" })}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-bold text-ink hover:bg-bg"
          >
            <PrinterIcon size={18} />
            کارت هدیه قابل چاپ
          </Link>
        </>
      ) : gift.state === "pending" ? (
        <p className="mt-2 text-sm text-ink-muted">بعد از پرداخت، لینک هدیه این‌جا نمایش داده می‌شود.</p>
      ) : null}
    </section>
  );
}
