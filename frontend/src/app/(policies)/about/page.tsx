import type { Metadata } from "next";
import { ABOUT } from "@/lib/content/policies";
import { PolicySections, PolicyShell } from "../PolicyShell";

export const metadata: Metadata = {
  title: ABOUT.title,
  description: ABOUT.description,
  alternates: { canonical: ABOUT.path },
  openGraph: { title: ABOUT.title, description: ABOUT.description, url: ABOUT.path, locale: "fa_IR", type: "website" },
};

export default function AboutPage() {
  return (
    <PolicyShell current={ABOUT.path} title={ABOUT.title} intro={ABOUT.intro}>
      <PolicySections page={ABOUT} />
    </PolicyShell>
  );
}
