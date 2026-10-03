import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

// Personal, per-visitor page: never cached or indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تکمیل خرید",
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const value of Array.isArray(v) ? v : v != null ? [v] : []) qs.append(k, value);
  }
  return <CheckoutFlow search={qs.toString()} />;
}
