import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { TicketDetail } from "@/lib/platform-types";
import { serverApiGet } from "@/lib/server-session";
import { platformRoutes } from "@/lib/platform-routes";
import { cleanTrackingCode } from "@/lib/support";
import { TicketThread } from "@/components/platform/TicketThread";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "درخواست پشتیبانی", robots: { index: false, follow: false } };

export default async function AccountTicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = cleanTrackingCode(decodeURIComponent(code));
  const ticket = clean ? await serverApiGet<TicketDetail>(`/support/tickets/${clean}/`).catch(() => null) : null;
  if (!ticket) notFound();
  return (
    <div className="space-y-4">
      <Link href={platformRoutes.accountSupport} className="inline-flex min-h-11 items-center text-sm font-bold text-primary">
        → همه درخواست‌ها
      </Link>
      <TicketThread initial={ticket} />
    </div>
  );
}
