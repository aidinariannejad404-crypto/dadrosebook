import type { Metadata } from "next";
import { PaymentResult, type ResultStatus } from "@/components/checkout/PaymentResult";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "نتیجه پرداخت",
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CheckoutResultPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const order = first(sp.order).trim().slice(0, 40);
  const raw = first(sp.status);
  const status: ResultStatus = raw === "paid" || raw === "failed" || raw === "cancelled" ? raw : "pending";
  return <PaymentResult orderNumber={/^[A-Za-z0-9-]+$/.test(order) ? order : ""} status={status} />;
}
