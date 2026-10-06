import type { Metadata } from "next";
import { GuestWishlist } from "@/components/wishlist/GuestWishlist";

export const metadata: Metadata = {
  title: "علاقه‌مندی‌ها",
  robots: { index: false, follow: false },
};

/** Guest wishlist (ج۶): hearts kept in this browser; signed-in visitors are sent to their account list. */
export default function GuestWishlistPage() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-site px-4 py-5 md:py-8">
      <h1 className="mb-4 text-xl font-black text-ink md:text-2xl">علاقه‌مندی‌ها</h1>
      <GuestWishlist />
    </div>
  );
}
