"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { CalendarIcon } from "@/components/ui/Icons";
import type { StudyPlanFormProps } from "./StudyPlanForm";

// The form (validation, submit) loads only when the dialog opens: no cost for the product page.
const StudyPlanForm = dynamic(() => import("./StudyPlanForm").then((m) => m.StudyPlanForm), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-80 place-items-center text-sm text-ink-muted" role="status">
      در حال بارگذاری فرم…
    </div>
  ),
});

/** Opens the study-plan form in an accessible dialog. */
export function StudyPlanButton({ label, className, ...form }: StudyPlanFormProps & { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={
          className ??
          "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 font-extrabold text-ink transition-[filter] hover:brightness-95"
        }
      >
        <CalendarIcon size={20} className="shrink-0" />
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="برنامه مطالعه شخصی تا روز آزمون">
        {open && <StudyPlanForm {...form} />}
      </Dialog>
    </>
  );
}
