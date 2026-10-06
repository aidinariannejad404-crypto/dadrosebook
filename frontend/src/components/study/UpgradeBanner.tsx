"use client";

import { useEffect, useState } from "react";
import { trackEditionUpgradeOfferView } from "@/lib/analytics";
import { apiFetch } from "@/lib/session";
import type { UpgradeOffer } from "@/lib/study";

/**
 * ه۲ on the product page: «شما ویرایش ۱۴۰۴ را دارید؛ ارتقا با ۴۰٪ تخفیف». Fetched in the browser
 * (the page itself is cached for everyone); renders nothing for visitors without an offer.
 * The discount is applied automatically at checkout.
 */
export function UpgradeBanner({ slug, className = "" }: { slug: string; className?: string }) {
  const [offer, setOffer] = useState<UpgradeOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ offer: UpgradeOffer | null }>(`/study/books/${encodeURIComponent(slug)}/upgrade/`, {
      retry: false,
    }).then((res) => {
      if (cancelled || !res.ok || !res.data.offer) return;
      setOffer(res.data.offer);
      trackEditionUpgradeOfferView({ item_id: slug, percent: res.data.offer.percent });
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!offer) return null;
  return (
    <div className={`study-pop rounded-card border border-success bg-success-soft p-3 ${className}`} role="status">
      <p className="font-extrabold leading-7 text-success">{offer.message}</p>
      <p className="mt-0.5 text-xs leading-6 text-ink">
        تخفیف ارتقا هنگام پرداخت خودکار روی یک نسخه از این ویرایش اعمال می‌شود؛ نسخه قبلی هم مال خودتان می‌ماند.
      </p>
    </div>
  );
}
