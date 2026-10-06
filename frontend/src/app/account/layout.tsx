import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getMe, hasSessionCookie } from "@/lib/server-session";
import { AccountNav } from "@/components/account/AccountNav";
import { SessionGate } from "@/components/account/SessionGate";
import { OfficialChannelsNote } from "@/components/platform/OfficialChannelsNote"; // platform stream (PF-3)

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "حساب کاربری",
  robots: { index: false, follow: false },
};

/**
 * Customer account shell. Pages render only for an identified visitor: otherwise SessionGate
 * refreshes an expired access token (refresh cookie still valid) or sends the visitor to
 * /login?next=<this page>.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) {
    return (
      <div className="mx-auto max-w-site px-4">
        <SessionGate hasCookie={await hasSessionCookie()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-site px-4 pb-12 pt-4 md:pt-6">
      <p className="text-sm text-ink-muted">حساب کاربری</p>
      <p className="mb-4 text-lg font-extrabold text-ink md:mb-6">{me.full_name || "کاربر دادرُز"}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
      <OfficialChannelsNote className="mt-8" />
    </div>
  );
}
