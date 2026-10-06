import type { Metadata } from "next";
import { RETURNS } from "@/lib/content/policies";
import { PolicySections, PolicyShell } from "../PolicyShell";

export const metadata: Metadata = {
  title: RETURNS.title,
  description: RETURNS.description,
  alternates: { canonical: RETURNS.path },
  openGraph: { title: RETURNS.title, description: RETURNS.description, url: RETURNS.path, locale: "fa_IR", type: "website" },
};

export default function ReturnsPage() {
  return (
    <PolicyShell current={RETURNS.path} title={RETURNS.title} intro={RETURNS.intro}>
      <PolicySections page={RETURNS} />
    </PolicyShell>
  );
}
