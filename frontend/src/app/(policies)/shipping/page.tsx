import type { Metadata } from "next";
import { SHIPPING } from "@/lib/content/policies";
import { PolicySections, PolicyShell } from "../PolicyShell";

export const metadata: Metadata = {
  title: SHIPPING.title,
  description: SHIPPING.description,
  alternates: { canonical: SHIPPING.path },
  openGraph: { title: SHIPPING.title, description: SHIPPING.description, url: SHIPPING.path, locale: "fa_IR", type: "website" },
};

export default function ShippingPage() {
  return (
    <PolicyShell current={SHIPPING.path} title={SHIPPING.title} intro={SHIPPING.intro}>
      <PolicySections page={SHIPPING} />
    </PolicyShell>
  );
}
