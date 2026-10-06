import type { Metadata } from "next";
import Link from "next/link";
import { platformRoutes } from "@/lib/platform-routes";
import { SupportForm } from "@/components/platform/SupportForm";
import { OfficialChannelsNote } from "@/components/platform/OfficialChannelsNote";

export const metadata: Metadata = {
  title: "پشتیبانی و ثبت درخواست",
  description: "مشکل سفارش، کتاب الکترونیک، پرداخت یا ورود را ثبت کنید و با کد پیگیری وضعیت پاسخ را ببینید.",
  alternates: { canonical: "/support" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** PF-11 contact page: open a ticket, or check one with phone + tracking code. */
export default async function SupportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:py-10">
      <div>
        <h1 className="text-2xl font-black text-ink">پشتیبانی دادرُز</h1>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          پیش از ثبت درخواست، <Link href="/faq" className="font-bold text-primary underline-offset-4 hover:underline">پرسش‌های متداول</Link> را
          ببینید. درخواست ثبت‌شده کد پیگیری می‌گیرد و پاسخ پشتیبانی برایتان پیامک می‌شود.
        </p>
        <p className="mt-2 text-sm">
          <Link href={platformRoutes.track()} className="inline-flex min-h-11 items-center font-bold text-primary underline-offset-4 hover:underline">
            قبلاً درخواست ثبت کرده‌اید؟ پیگیری با کد
          </Link>
        </p>
      </div>
      <SupportForm defaults={{ topic: one(sp.topic), order: one(sp.order), book: one(sp.book), source: one(sp.source) || "support" }} />
      <OfficialChannelsNote />
    </div>
  );
}
