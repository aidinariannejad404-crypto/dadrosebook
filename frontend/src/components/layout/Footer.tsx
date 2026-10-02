import Link from "next/link";
import { format as formatJalali } from "date-fns-jalali";
import { COURSE_SITE, SITE_NAME, routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { consultLinks } from "@/lib/consult";
import type { StoreSettings } from "@/lib/types";

const links = [
  { href: routes.kit, label: "بسته مطالعاتی آزمون" },
  { href: routes.search({ quick_review: "true" }), label: "کتاب‌های سریع‌خوان" },
  { href: routes.search({ format: "ebook" }), label: "کتاب‌های الکترونیک" },
  { href: routes.cart, label: "سبد خرید" },
];

const footerLink = "inline-flex min-h-11 items-center text-sm text-white/85 hover:text-white hover:underline";

/** Footer (P1-18): support channels, hours, students claim and the eNamad seal come from store settings. */
export function Footer({ store }: { store: StoreSettings | null }) {
  const year = toPersianDigits(formatJalali(new Date(), "yyyy"));
  const consult = consultLinks(store);
  const enamad = store?.enamad_html?.trim();
  return (
    <footer className="mt-12 bg-primary text-white">
      <div className="mx-auto grid max-w-site gap-8 px-4 py-10 md:grid-cols-[2fr_1fr_1fr_auto]">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about" className="text-lg font-extrabold text-accent">
            {SITE_NAME}
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-7 text-white/85">
            فروشگاه تخصصی منابع آزمون وکالت، قضاوت، سردفتری و ارشد. کتاب‌ها را به‌صورت چاپی، الکترونیک یا
            بسته چاپی + الکترونیک تهیه کنید و برنامه مطالعه‌تان را با بسته‌های پیشنهادی دادرُز بچینید.
          </p>
          {store?.students_count_claim && (
            <p className="mt-3 text-sm font-bold text-accent">{store.students_count_claim}</p>
          )}
        </section>
        <nav aria-labelledby="footer-links">
          <h2 id="footer-links" className="font-bold">
            دسترسی سریع
          </h2>
          <ul className="mt-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link prefetch={false} href={l.href} className="inline-flex min-h-11 items-center text-sm text-white/85 hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact" className="font-bold">
            ارتباط با ما
          </h2>
          <ul className="mt-2">
            {consult?.whatsapp && (
              <li>
                <a href={consult.whatsapp} target="_blank" rel="noopener" className={footerLink}>
                  مشاوره و پشتیبانی در واتساپ
                </a>
              </li>
            )}
            {consult?.telegram && (
              <li>
                <a href={consult.telegram} target="_blank" rel="noopener" className={footerLink}>
                  مشاوره و پشتیبانی در تلگرام
                </a>
              </li>
            )}
            <li>
              <a
                href={`${COURSE_SITE}/?utm_source=dadrosebook&utm_medium=referral&utm_campaign=footer`}
                target="_blank"
                rel="noopener"
                className={footerLink}
              >
                دوره‌های آموزشی دادرُز
              </a>
            </li>
            {!consult && (
              <li>
                <a href={`${COURSE_SITE}/contact`} target="_blank" rel="noopener" className={footerLink}>
                  پشتیبانی و مشاوره انتخاب منابع
                </a>
              </li>
            )}
          </ul>
          {store?.support_hours && <p className="mt-1 text-sm text-white/85">ساعت پاسخ‌گویی: {store.support_hours}</p>}
        </section>
        {enamad && (
          // Sanitised on the backend (only <a>/<img>, https, rel="noopener") before it reaches the API.
          <div
            role="group"
            aria-label="نماد اعتماد الکترونیکی"
            className="grid min-h-28 min-w-28 place-items-center self-start rounded-card bg-white p-2 [&_img]:max-h-28 [&_img]:w-auto"
            dangerouslySetInnerHTML={{ __html: enamad }}
          />
        )}
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-site px-4 py-4 text-center text-xs text-white/80">
          © {year} {SITE_NAME}. همه حقوق محفوظ است.
        </p>
      </div>
    </footer>
  );
}
