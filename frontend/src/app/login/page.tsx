import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/server-session";
import { safeNext } from "@/lib/otp";
import { LoginView } from "@/components/auth/LoginView";
import { ShieldIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ورود / ثبت‌نام",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeNext(raw);
  if (await getMe()) redirect(next);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 md:py-14">
      <div className="rounded-card bg-surface p-5 shadow-card md:p-7">
        <LoginView next={next} />
      </div>
      <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-6 text-ink-muted">
        <ShieldIcon size={18} className="mt-0.5 shrink-0 text-primary" />
        شماره شما فقط برای ورود، اطلاع از وضعیت سفارش و پشتیبانی استفاده می‌شود؛ رمز عبوری لازم نیست.
      </p>
    </div>
  );
}
