import Link from "next/link";
import { getHomeCampaigns } from "@/lib/api";
import { campaignPath, countdownTo } from "@/lib/growth";
import { toPersianDigits } from "@/lib/format";
import { ChevronIcon, TicketIcon } from "@/components/ui/Icons";

/**
 * و۶ home banner hook: the running campaign flagged «بنر صفحه اصلی» (soonest to end first).
 * Renders nothing when there is none or the API is unavailable.
 */
export async function CampaignBanner() {
  const [campaign] = await getHomeCampaigns();
  if (!campaign) return null;
  const left = countdownTo(campaign.ends_at, Date.now());
  const when = left.days > 0 ? `${toPersianDigits(left.days)} روز مانده` : "آخرین روز";
  return (
    <Link
      href={campaignPath(campaign.slug)}
      style={campaign.hero_color ? { background: campaign.hero_color } : undefined}
      className="group flex min-h-14 items-center gap-3 rounded-card bg-primary px-4 py-3 text-white shadow-card transition-transform hover:-translate-y-0.5 md:px-6"
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-ink">
        <TicketIcon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black leading-7">{campaign.title}</span>
        <span className="block text-sm text-white/85">
          {[campaign.discount_label, when].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="hidden shrink-0 text-sm font-bold sm:inline">مشاهده کتاب‌ها</span>
      <ChevronIcon size={20} className="shrink-0" />
    </Link>
  );
}
