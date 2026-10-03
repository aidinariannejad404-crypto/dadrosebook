import type { Metadata } from "next";
import type { Address } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { AddressManager } from "@/components/account/AddressManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "نشانی‌ها", robots: { index: false, follow: false } };

async function safe<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default async function AddressesPage() {
  const [addresses, provinces] = await Promise.all([
    safe(serverApiGet<Address[]>("/addresses/")),
    safe(serverApiGet<string[]>("/addresses/provinces/")),
  ]);
  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-ink">نشانی‌ها</h1>
      {addresses == null ? (
        <p className="rounded-card bg-surface p-4 text-ink-muted">فهرست نشانی‌ها فعلاً در دسترس نیست.</p>
      ) : (
        <AddressManager initial={Array.isArray(addresses) ? addresses : []} provinces={provinces ?? []} />
      )}
    </div>
  );
}
