"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Quote } from "@/lib/account-types";
import type { Cart } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { campaignPath } from "@/lib/growth";
import { apiFetch } from "@/lib/session";
import { TicketIcon } from "@/components/ui/Icons";

type Applied = { title: string; slug: string; amount: number } | null;

/**
 * و۶: shows a running campaign's auto-applied discount in the cart. Asks the checkout quote (the same
 * server-side pricing the order will use) whenever the available lines change; silent on errors.
 */
export function CampaignCartNote({ cart }: { cart: Cart }) {
  const [applied, setApplied] = useState<Applied>(null);
  const items = cart.items.filter((i) => i.is_available).map((i) => ({ variant_id: i.variant.id, quantity: i.quantity }));
  const key = items.map((i) => `${i.variant_id}x${i.quantity}`).join(",");

  useEffect(() => {
    if (!key) {
      setApplied(null);
      return;
    }
    let alive = true;
    const body = {
      items: key.split(",").map((p) => {
        const [variant_id, quantity] = p.split("x").map(Number);
        return { variant_id, quantity };
      }),
    };
    const t = window.setTimeout(async () => {
      const res = await apiFetch<Quote>("/checkout/quote/", { method: "POST", json: body });
      if (!alive) return;
      const d = res.ok ? res.data.discount : null;
      setApplied(d?.campaign ? { ...d.campaign, amount: d.amount } : null);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [key]);

  if (!applied) return null;
  return (
    <div className="mt-3 rounded-control bg-success-soft px-3 py-2.5 text-sm leading-7 text-success">
      <p className="flex items-center justify-between gap-2 font-bold">
        <span className="flex items-center gap-1.5">
          <TicketIcon size={18} className="shrink-0" />
          تخفیف {applied.title}
        </span>
        <span>−{formatToman(applied.amount)}</span>
      </p>
      <p className="text-xs">
        در پرداخت خودکار اعمال می‌شود.{" "}
        <Link href={campaignPath(applied.slug)} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          کتاب‌های کمپین
        </Link>
      </p>
    </div>
  );
}
