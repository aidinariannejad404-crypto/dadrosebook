"use client";

import { useState } from "react";
import { trackNotifyMeRequested } from "@/lib/analytics";
import type { VariantType } from "@/lib/types";
import { BellIcon } from "./Icons";
import { Dialog } from "./Dialog";

interface NotifyMeButtonProps {
  bookId: number;
  bookTitle: string;
  /** e.g. "PRINT" */
  variantType?: VariantType;
  /** an ebook of the same book is available right now */
  ebookAvailable?: boolean;
  className?: string;
  size?: "sm" | "md";
}

/**
 * "موجود شد خبرم کن" — Phase 1 is honest: the registration endpoint arrives in Phase 2,
 * so the dialog explains that instead of faking a success state.
 */
export function NotifyMeButton({
  bookId,
  bookTitle,
  variantType = "PRINT",
  ebookAvailable = false,
  className = "",
  size = "md",
}: NotifyMeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackNotifyMeRequested({ item_id: bookId, item_name: bookTitle, variant: variantType });
        }}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-primary bg-surface font-bold text-primary transition-colors hover:bg-primary-soft ${
          size === "sm" ? "whitespace-nowrap px-2 text-xs" : "px-5 text-base"
        } ${className}`}
      >
        <BellIcon size={size === "sm" ? 16 : 20} className="shrink-0" />
        موجود شد خبرم کن
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="موجود شد خبرم کن">
        <p className="leading-8">
          نسخه چاپی «{bookTitle}» در حال حاضر موجود نیست. ثبت درخواست اطلاع‌رسانی به‌زودی فعال
          می‌شود؛ پس از فعال شدن، با ثبت شماره موبایل، هنگام موجود شدن کتاب پیامک دریافت می‌کنید.
        </p>
        {ebookAvailable && (
          <p className="mt-3 rounded-control bg-success-soft px-3 py-2 text-sm leading-7 text-success">
            نسخه الکترونیک این کتاب همین حالا موجود است.
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
          >
            متوجه شدم
          </button>
        </div>
      </Dialog>
    </>
  );
}
