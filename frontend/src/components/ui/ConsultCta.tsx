import type { StoreSettings } from "@/lib/types";
import { consultLinks } from "@/lib/consult";
import { ChatIcon, ExternalIcon } from "./Icons";

interface ConsultCtaProps {
  store: StoreSettings | null;
  exam?: string | null;
  book?: string | null;
  /** "dark" sits on the navy hero */
  tone?: "light" | "dark";
  className?: string;
}

/**
 * «مشاوره رایگان انتخاب منبع» (P1-12): WhatsApp (prefilled message) and/or Telegram links from the
 * store settings. Renders nothing when neither channel is configured.
 */
export function ConsultCta({ store, exam, book, tone = "light", className = "" }: ConsultCtaProps) {
  const links = consultLinks(store, { exam, book });
  if (!links) return null;
  const dark = tone === "dark";
  const linkCls = `inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control border px-3 text-sm font-bold transition-colors ${
    dark
      ? "border-white/30 text-white hover:bg-white/10"
      : "border-line-strong bg-surface text-ink hover:border-primary hover:bg-primary-soft"
  }`;
  const channels = [
    links.whatsapp && { href: links.whatsapp, label: "واتساپ" },
    links.telegram && { href: links.telegram, label: "تلگرام" },
  ].filter((c): c is { href: string; label: string } => Boolean(c));

  return (
    <div className={className}>
      <p className={`flex items-center gap-2 text-sm font-bold ${dark ? "text-white" : "text-ink"}`}>
        <ChatIcon size={18} className={dark ? "text-accent" : "text-primary"} />
        مشاوره رایگان انتخاب منبع
        {store?.support_hours && (
          <span className={`text-xs font-medium ${dark ? "text-white/80" : "text-ink-muted"}`}>· {store.support_hours}</span>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        {channels.map((c) => (
          <a key={c.label} href={c.href} target="_blank" rel="noopener" className={linkCls}>
            {c.label}
            <ExternalIcon size={16} />
            <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
          </a>
        ))}
      </div>
    </div>
  );
}
