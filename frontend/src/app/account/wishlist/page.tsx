import type { Metadata } from "next";
import type { WishlistEntry } from "@/lib/account-types";
import { serverApiGet } from "@/lib/server-session";
import { EmptyState } from "@/components/account/EmptyState";
import { WishlistGrid } from "@/components/wishlist/WishlistGrid";
import { HeartIcon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "علاقه‌مندی‌ها", robots: { index: false, follow: false } };

export default async function WishlistPage() {
  let entries: WishlistEntry[] | null = null;
  try {
    entries = await serverApiGet<WishlistEntry[]>("/wishlist/");
  } catch {
    entries = null;
  }
  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-ink">علاقه‌مندی‌ها</h1>
      {entries == null ? (
        <p className="rounded-card bg-surface p-4 text-ink-muted shadow-card">فهرست علاقه‌مندی‌ها فعلاً در دسترس نیست.</p>
      ) : entries.length === 0 ? (
        <EmptyState icon={<HeartIcon size={40} />} title="هنوز کتابی نشان نکرده‌اید" href="/" action="دیدن کتاب‌ها">
          با زدن دکمه قلب در صفحه هر کتاب، آن را اینجا نگه دارید تا بعداً راحت پیدایش کنید.
        </EmptyState>
      ) : (
        <WishlistGrid entries={entries} />
      )}
    </div>
  );
}
