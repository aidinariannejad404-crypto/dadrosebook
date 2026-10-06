"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { WishlistEntry } from "@/lib/account-types";
import type { BookCard } from "@/lib/types";
import { apiFetch } from "@/lib/session";
import { readGuestIds } from "@/lib/guest-wishlist";
import { accountRoutes } from "@/lib/account-routes";
import { routes } from "@/lib/config";
import { EmptyState } from "@/components/account/EmptyState";
import { HeartIcon } from "@/components/ui/Icons";
import { BookCardSkeleton } from "@/components/ui/Skeleton";
import { WishlistGrid } from "./WishlistGrid";

/** Client list of the browser's hearts; a signed-in visitor goes to /account/wishlist instead. */
export function GuestWishlist() {
  const router = useRouter();
  const [entries, setEntries] = useState<WishlistEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const me = await apiFetch("/me/");
      if (me.ok) {
        router.replace(routes.wishlist);
        return;
      }
      const ids = readGuestIds();
      if (ids.length === 0) {
        if (alive) setEntries([]);
        return;
      }
      const res = await apiFetch<BookCard[]>(`/wishlist/cards/?ids=${ids.join(",")}`);
      if (alive) setEntries(res.ok ? res.data.map((book) => ({ book, added_at: "" })) : []);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  if (entries == null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-label="در حال بارگذاری">
        {Array.from({ length: 4 }, (_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyState icon={<HeartIcon size={40} />} title="هنوز کتابی نشان نکرده‌اید" href="/" action="دیدن کتاب‌ها">
        با زدن دکمه قلب روی هر کتاب، آن را اینجا نگه دارید؛ بدون نیاز به ورود.
      </EmptyState>
    );
  }
  return (
    <>
      <p className="mb-4 rounded-control bg-primary-soft px-3 py-2.5 text-sm leading-7 text-ink">
        این فهرست فقط در همین مرورگر ذخیره شده است.{" "}
        <Link href={accountRoutes.login(routes.wishlist)} className="font-bold text-primary underline underline-offset-4">
          با ورود به حساب
        </Link>{" "}
        آن را در همه دستگاه‌ها نگه دارید.
      </p>
      <WishlistGrid entries={entries} guest />
    </>
  );
}
