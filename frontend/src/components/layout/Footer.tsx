import Link from "next/link";
import { format as formatJalali } from "date-fns-jalali";
import { COURSE_SITE, SITE_NAME, routes } from "@/lib/config";
import { toPersianDigits } from "@/lib/format";
import { consultLinks } from "@/lib/consult";
import type { StoreSettings } from "@/lib/types";
import { Logo } from "@/components/brand/Logo";
import { BadgeIcon, TruckIcon } from "@/components/ui/Icons";
import { InstagramIcon, LockIcon, TelegramIcon, WhatsappIcon } from "./NavIcons";

const shopLinks = [
  { href: routes.kit, label: "بسته مطالعاتی آزمون" },
  { href: routes.search({ quick_review: "true" }), label: "کتاب‌های سریع‌خوان" },
  { href: routes.search({ format: "ebook" }), label: "کتاب‌های الکترونیک" },
  { href: routes.cart, label: "سبد خرید" },
];

/** Policy pages (created in the help/policy package). */
export const POLICY_LINKS = [
  { href: "/about", label: "درباره ما" },
  { href: "/shipping", label: "شیوه‌ها و هزینه ارسال" },
  { href: "/returns", label: "بازگشت کالا" },
  { href: "/faq", label: "پرسش‌های متداول" },
];

export const TRUST_BADGES = [
  { icon: LockIcon, title: "پرداخت امن", text: "درگاه بانکی معتبر" },
  { icon: TruckIcon, title: "ارسال سراسری", text: "به همه شهرهای ایران" },
  { icon: BadgeIcon, title: "ضمانت اصالت", text: "کتاب اصل از ناشر" },
];

const footerLink = "inline-flex min-h-11 items-center text-sm text-white/85 hover:text-white hover:underline";
const socialBtn =
  "inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-accent hover:text-ink";

/** Instagram is optional in store settings (rendered only when a real https URL is configured). */
function instagramUrl(store: StoreSettings | null): string | null {
  const raw = (store as (StoreSettings & { instagram_url?: string }) | null)?.instagram_url?.trim();
  return raw && /^https:\/\/(www\.)?instagram\.com\//i.test(raw) ? raw : null;
}

/** Footer: logo, trust badges, links incl. policy pages, support channels from store settings, eNamad. */
export function Footer({ store }: { store: StoreSettings | null }) {
  const year = toPersianDigits(formatJalali(new Date(), "yyyy"));
  const consult = consultLinks(store);
  const instagram = instagramUrl(store);
  const enamad = store?.enamad_html?.trim();
  const social = [
    consult?.whatsapp && { href: consult.whatsapp, label: "واتساپ دادرُز", icon: WhatsappIcon },
    consult?.telegram && { href: consult.telegram, label: "تلگرام دادرُز", icon: TelegramIcon },
    instagram && { href: instagram, label: "اینستاگرام دادرُز", icon: InstagramIcon },
  ].filter(Boolean) as { href: string; label: string; icon: typeof LockIcon }[];

  return (
    <footer className="mt-12 bg-primary text-white">
      <div className="border-b border-white/10">
        <ul aria-label="ضمانت‌های خرید" className="mx-auto grid max-w-site grid-cols-3 gap-2 px-4 py-5">
          {TRUST_BADGES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:text-start">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-ink">
                <Icon size={22} />
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-bold">{title}</span>
                <span className="mt-0.5 hidden text-xs text-white/80 sm:block">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto grid max-w-site gap-8 px-4 py-10 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <section aria-label={`درباره ${SITE_NAME}`}>
          <Logo variant="footer-on-dark" />
          <p className="mt-3 max-w-prose text-sm leading-7 text-white/85">
            فروشگاه تخصصی منابع آزمون وکالت، قضاوت، سردفتری و ارشد. کتاب‌ها را به‌صورت چاپی، الکترونیک یا
            بسته چاپی + الکترونیک تهیه کنید و برنامه مطالعه‌تان را با بسته‌های پیشنهادی دادرُز بچینید.
          </p>
          {store?.students_count_claim && (
            <p className="mt-3 text-sm font-bold text-accent">{store.students_count_claim}</p>
          )}
          {social.length > 0 && (
            <ul aria-label="شبکه‌های اجتماعی" className="mt-4 flex gap-2">
              {social.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener" aria-label={label} className={socialBtn}>
                    <Icon size={22} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <nav aria-labelledby="footer-links">
          <h2 id="footer-links" className="font-bold">
            دسترسی سریع
          </h2>
          <ul className="mt-2">
            {shopLinks.map((l) => (
              <li key={l.href}>
                <Link prefetch={false} href={l.href} className={footerLink}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="footer-help">
          <h2 id="footer-help" className="font-bold">
            راهنمای خرید
          </h2>
          <ul className="mt-2">
            {POLICY_LINKS.map((l) => (
              <li key={l.href}>
                <Link prefetch={false} href={l.href} className={footerLink}>
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
