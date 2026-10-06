import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGift } from "@/lib/api";
import { NOINDEX } from "@/lib/seo";
import { GiftClaim } from "@/components/growth/GiftClaim";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "هدیه کتاب",
  description: "کتابی که برایتان هدیه فرستاده‌اند را دریافت کنید.",
  robots: NOINDEX,
};

/** و۴: claim a gift link (phone OTP, address for print books). Private: noindex, no referrer leak. */
export default async function GiftPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) notFound();
  const gift = await getGift(token).catch(() => null);
  if (!gift) notFound();
  return (
    <div className="px-4 py-6 md:py-10">
      <GiftClaim initial={gift} />
    </div>
  );
}
