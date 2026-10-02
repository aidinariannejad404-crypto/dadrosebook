import { BadgeIcon, ChatIcon, ShieldIcon, UserIcon } from "@/components/ui/Icons";

const items = [
  { icon: ShieldIcon, title: "پرداخت امن", text: "درگاه بانکی معتبر و رسید فوری" },
  { icon: UserIcon, title: "خرید بدون ثبت‌نام", text: "سفارش سریع فقط با شماره موبایل" },
  { icon: ChatIcon, title: "مشاوره انتخاب منابع", text: "راهنمایی برای انتخاب و ترتیب منابع" },
  { icon: BadgeIcon, title: "نماد اعتماد الکترونیکی", text: "نماد اعتماد در پایین صفحه" },
];

export function TrustRow() {
  return (
    <section aria-labelledby="trust-title">
      <h2 id="trust-title" className="sr-only">
        چرا کتاب دادرُز؟
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col items-start gap-2 rounded-card bg-surface p-4 shadow-card sm:flex-row sm:gap-3">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-ink">{title}</span>
              <span className="mt-0.5 block text-xs leading-6 text-ink-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
