import { siteUrl } from "@/lib/config";
import { officialChannelsText } from "@/lib/official-channels";
import { ShieldCheckIcon } from "./PlatformIcons";

/** PF-3: «راه‌های رسمی ارتباط» — anti-phishing line in the account and the footer. */
export function OfficialChannelsNote({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const dark = tone === "dark";
  return (
    <p
      className={`flex items-start gap-2 text-xs leading-6 ${dark ? "text-white/85" : "rounded-control bg-primary-soft px-3 py-2 text-ink"} ${className}`}
    >
      <ShieldCheckIcon size={18} className={`mt-0.5 shrink-0 ${dark ? "text-accent" : "text-primary"}`} />
      <span>
        <strong className="font-bold">راه‌های رسمی ارتباط: </strong>
        {officialChannelsText(siteUrl())}
      </span>
    </p>
  );
}
