import type { VariantType } from "@/lib/types";

const LABEL: Record<"PRINT_ONLY" | "EBOOK_ONLY" | "BOTH", string> = {
  PRINT_ONLY: "چاپی",
  EBOOK_ONLY: "الکترونیک",
  BOTH: "چاپی + الکترونیک",
};

/** Compact format summary: چاپی / الکترونیک / چاپی + الکترونیک */
export function formatSummary(formats: VariantType[]): string | null {
  const print = formats.includes("PRINT") || formats.includes("BUNDLE");
  const ebook = formats.includes("EBOOK") || formats.includes("BUNDLE");
  if (print && ebook) return LABEL.BOTH;
  if (print) return LABEL.PRINT_ONLY;
  if (ebook) return LABEL.EBOOK_ONLY;
  return null;
}

export function FormatBadges({ formats }: { formats: VariantType[] }) {
  const label = formatSummary(formats);
  if (!label) return null;
  return (
    <span className="inline-flex w-fit items-center self-start rounded-md bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-bold text-primary">
      {label}
    </span>
  );
}
