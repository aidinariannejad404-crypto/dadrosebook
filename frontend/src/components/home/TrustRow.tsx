import type { StoreSettings } from "@/lib/types";
import { consultLinks } from "@/lib/consult";
import { BadgeIcon, ChatIcon, ShieldIcon, TruckIcon, UserIcon } from "@/components/ui/Icons";

type Item = { icon: typeof ShieldIcon; title: string; text: string };

/**
 * Trust row (P1-18): only real claims. Store-driven items (shipping, support, students claim)
 * disappear when their settings are empty; the eNamad seal itself lives in the footer.
 */
export function trustItems(store: StoreSettings | null): Item[] {
  const items: Item[] = [];
  if (store?.students_count_claim) {
    items.push({ icon: BadgeIcon, title: store.students_count_claim, text: "کتاب‌ها و دوره‌های اساتید دادرُز" });
  }
  items.push({ icon: ShieldIcon, title: "پرداخت امن", text: "درگاه بانکی معتبر و رسید فوری" });
  const shipping = [store?.delivery_tehran_note, store?.delivery_province_note].filter(Boolean).join("، ");
  if (shipping) items.push({ icon: TruckIcon, title: "ارسال به سراسر کشور", text: shipping });
  if (consultLinks(store)) {
    const channels = [store?.consult_whatsapp && "واتساپ", store?.consult_telegram && "تلگرام"].filter(Boolean).join(" و ");
    items.push({
      icon: ChatIcon,
      title: "مشاوره رایگان انتخاب منبع",
      text: [channels && `از طریق ${channels}`, store?.support_hours].filter(Boolean).join("، "),
    });
  }
  items.push({ icon: UserIcon, title: "خرید بدون ثبت‌نام", text: "سفارش سریع فقط با شماره موبایل" });
  return items.slice(0, 4);
}

export function TrustRow({ store }: { store: StoreSettings | null }) {
  const items = trustItems(store);
  return (
    <section aria-labelledby="trust-title">
      <h2 id="trust-title" className="sr-only">
        چرا کتاب دادرُز؟
      </h2>
      <ul className={`grid grid-cols-2 gap-3 ${items.length >= 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : ""}`}>
        {items.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            className="flex flex-col items-start gap-2 rounded-card bg-surface p-4 shadow-card last:odd:col-span-2 sm:flex-row sm:gap-3 lg:last:odd:col-span-1"
          >
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-ink">{title}</span>
              {text && <span className="mt-0.5 block text-xs leading-6 text-ink-muted">{text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
