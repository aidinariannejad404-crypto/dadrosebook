import type { Metadata } from "next";
import type { ReactNode } from "react";

/*
 * Enclosed checkout. The root layout swaps the site chrome for CheckoutHeader / CheckoutFooter on
 * /checkout (via <HideOn>, decided from the pathname during SSR, so there is no layout shift) and
 * never renders the mobile bottom nav under /checkout. This layout only keeps the whole section
 * (incl. /checkout/result) out of search engines.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
