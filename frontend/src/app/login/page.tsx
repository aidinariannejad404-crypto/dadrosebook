import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getMe } from "@/lib/server-session";
import { safeNext } from "@/lib/otp";
import { SITE_NAME } from "@/lib/config";
import { LoginView } from "@/components/auth/LoginView";
import { BoltIcon, BookOpenIcon, ShieldIcon, TruckIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ورود / ثبت‌نام",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VALUE_PROPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <ShieldIcon size={22} />,
    title: "خرید بدون رمز",
    body: "فقط شماره موبایل و یک کد پیامکی؛ رمزی برای به خاطر سپردن نیست.",
  },
  {
    icon: <BoltIcon size={22} />,
    title: "شروع مطالعه فوری کتاب الکترونیک",
    body: "نسخه الکترونیک بلافاصله پس از پرداخت در کتابخانه شماست؛ از همان صفحه‌ای که ماندید ادامه دهید.",
  },
  {
    icon: <TruckIcon size={22} />,
    title: "پیگیری سفارش در یک نگاه",
    body: "وضعیت ارسال نسخه چاپی و سابقه خریدها همیشه در حساب شما.",
  },
];

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeNext(raw);
  if (await getMe()) redirect(next);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-5xl md:py-12">
      <div className="overflow-hidden rounded-card bg-surface shadow-raised md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* brand panel: desktop only (mobile gets the short list under the form) */}
        <aside
          aria-labelledby="login-brand"
          className="relative hidden overflow-hidden bg-primary p-10 text-white md:flex md:flex-col"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -end-28 size-72 rounded-full border-[28px]"
            style={{ borderColor: "color-mix(in srgb, var(--color-accent) 18%, transparent)" }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -end-8 top-8 size-20 rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, transparent)" }}
          />
          <span aria-hidden="true" className="mb-6 block h-1 w-14 rounded-full bg-accent" />
          <p id="login-brand" className="text-2xl font-black leading-10">
            {SITE_NAME}
          </p>
          <p className="mt-2 max-w-xs leading-8 text-white/85">منابع آزمون وکالت، قضاوت و سردفتری؛ چاپی و الکترونیک.</p>
          <ul className="relative mt-8 space-y-5">
            {VALUE_PROPS.map((v) => (
              <li key={v.title} className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-ink" aria-hidden="true">
                  {v.icon}
                </span>
                <span>
                  <span className="block font-extrabold text-white">{v.title}</span>
                  <span className="mt-0.5 block text-sm leading-7 text-white/80">{v.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="relative mt-auto flex items-center gap-2 pt-10 text-sm text-white/80">
            <BookOpenIcon size={18} className="text-accent" />
            کتاب‌هایتان همیشه در «کتابخانه من» در دسترس است.
          </p>
        </aside>

        <div className="p-5 sm:p-7 md:p-10">
          <span aria-hidden="true" className="mb-4 block h-1 w-10 rounded-full bg-accent md:hidden" />
          <LoginView next={next} />
          <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-xs leading-6 text-ink-muted">
            <ShieldIcon size={18} className="mt-0.5 shrink-0 text-primary" />
            شماره شما فقط برای ورود، اطلاع از وضعیت سفارش و پشتیبانی استفاده می‌شود؛ رمز عبوری لازم نیست.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-2 md:hidden" aria-label="مزایای حساب کاربری">
        {VALUE_PROPS.slice(0, 2).map((v) => (
          <li key={v.title} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-accent" aria-hidden="true">
              {v.icon}
            </span>
            <span className="text-sm font-bold text-ink">{v.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
