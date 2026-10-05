import type { Metadata } from "next";
import { SHIPPING } from "@/lib/content/policies";
import { getPublicShippingMethods } from "@/lib/api";
import { siteUrl } from "@/lib/config";
import { serializeJsonLd, shippingServiceJsonLd } from "@/lib/jsonld";
import { PolicySections, PolicyShell } from "../PolicyShell";

export const metadata: Metadata = {
  title: SHIPPING.title,
  description: SHIPPING.description,
  alternates: { canonical: SHIPPING.path },
  openGraph: { title: SHIPPING.title, description: SHIPPING.description, url: SHIPPING.path, locale: "fa_IR", type: "website" },
};

export default async function ShippingPage() {
  // Package الف۳: Organization → ShippingService from the live nationwide shipping methods
  const shippingLd = shippingServiceJsonLd(siteUrl(), await getPublicShippingMethods());
  return (
    <PolicyShell current={SHIPPING.path} title={SHIPPING.title} intro={SHIPPING.intro}>
      {shippingLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(shippingLd) }} />
      )}
      <PolicySections page={SHIPPING} />
    </PolicyShell>
  );
}
