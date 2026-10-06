import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = {
  title: "سبد خرید",
  robots: { index: false, follow: false },
};

/** Guest cart (client-rendered from the cart token; personal, never indexed). */
export default function CartPage() {
  return (
    <div className="mx-auto max-w-site px-4 py-5 md:py-8">
      <h1 className="mb-4 text-xl font-black text-ink md:text-2xl">سبد خرید</h1>
      <CartView />
    </div>
  );
}
