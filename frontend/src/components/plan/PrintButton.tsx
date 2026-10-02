"use client";

import { PrinterIcon } from "@/components/ui/Icons";

/** «ذخیره PDF / چاپ»: the browser's print dialog (A4 print stylesheet in globals.css). */
export function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold print:hidden ${className}`}
    >
      <PrinterIcon size={18} className="shrink-0" />
      ذخیره PDF / چاپ
    </button>
  );
}
