import type { Metadata } from "next";
import Link from "next/link";
import { platformRoutes } from "@/lib/platform-routes";
import { TicketTrack } from "@/components/platform/TicketTrack";

export const metadata: Metadata = { title: "پیگیری درخواست پشتیبانی", robots: { index: false, follow: true } };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** PF-11: guests check status with phone + tracking code. */
export default async function TrackPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const code = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:py-10">
      <div>
        <h1 className="text-2xl font-black text-ink">پیگیری درخواست پشتیبانی</h1>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          شماره موبایلی که با آن درخواست ثبت کردید و کد پیگیری ۸ رقمی را وارد کنید.{" "}
          <Link href={platformRoutes.support()} className="font-bold text-primary underline-offset-4 hover:underline">
            ثبت درخواست تازه
          </Link>
        </p>
      </div>
      <TicketTrack initialCode={code ?? ""} />
    </div>
  );
}
