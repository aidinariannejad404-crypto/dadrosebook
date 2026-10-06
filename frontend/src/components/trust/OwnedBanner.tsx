"use client";

import Link from "next/link";
import { useEffect } from "react";
import { trackOwnedBookNotice } from "@/lib/analytics";
import { accountRoutes } from "@/lib/account-routes";
import { ownedBanner } from "@/lib/owned";
import { BookOpenIcon, CheckIcon } from "@/components/ui/Icons";
import { useOwned } from "./useOwned";

/**
 * د۱ product-page banner: «در کتابخانه شما · ادامه مطالعه» for ebook owners, «این کتاب را در
 * {تاریخ} خریدید» for print owners. Rendered client-side only, so the page HTML stays the same for
 * every visitor; nothing shows for logged-out visitors.
 */
export function OwnedBanner({ bookId, slug, className = "" }: { bookId: number; slug: string; className?: string }) {
  const state = useOwned();
  const owned = state?.kind === "user" ? state.books.get(bookId) : undefined;
  const banner = ownedBanner(owned);
  const formats = owned?.formats.join(",") ?? "";
  useEffect(() => {
    if (formats) trackOwnedBookNotice({ item_id: bookId, formats: formats.split(","), surface: "product" });
  }, [bookId, formats]);
  if (!banner || !owned) return null;
  const read = banner.kind === "read";
  const href = read ? accountRoutes.read(slug) : owned.order_number ? accountRoutes.order(owned.order_number) : null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 text-sm ${
        read ? "bg-success-soft text-success" : "bg-info-soft text-info"
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 font-bold">
        {read ? <BookOpenIcon size={18} className="shrink-0" /> : <CheckIcon size={18} strokeWidth={2.6} className="shrink-0" />}
        {banner.text}
      </span>
      {href && banner.action && (
        <Link
          href={href}
          prefetch={false}
          className="inline-flex min-h-11 items-center font-extrabold underline underline-offset-4"
        >
          {read ? "· " : ""}
          {banner.action}
        </Link>
      )}
    </div>
  );
}
