import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/config";

export const metadata: Metadata = {
  title: "تکمیل خرید",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-site px-4 py-10">
      <section className="mx-auto max-w-lg rounded-card bg-surface px-5 py-10 text-center shadow-card">
        <h1 className="text-xl font-black text-ink">تکمیل خرید</h1>
        <p className="mt-3 leading-8 text-ink-muted">ورود و پرداخت به‌زودی فعال می‌شود. سبد خرید شما محفوظ است.</p>
        <Link
          href={routes.cart}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-6 font-bold text-white hover:bg-primary-hover"
        >
          بازگشت به سبد خرید
        </Link>
      </section>
    </div>
  );
}
