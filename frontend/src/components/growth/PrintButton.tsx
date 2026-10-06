"use client";

import { PrinterIcon } from "@/components/ui/Icons";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 font-extrabold text-white hover:bg-primary-hover"
    >
      <PrinterIcon size={20} />
      چاپ کارت
    </button>
  );
}
