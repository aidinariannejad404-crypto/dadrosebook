"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/Icons";
import { routes } from "@/lib/config";
import type { ExamTypeMini, SubjectMini } from "@/lib/types";

const OPEN_DELAY = 120;
const CLOSE_DELAY = 300;

/**
 * Desktop mega menu disclosure. The panel (exam × subject links) is built from plain data on first
 * open, so its ~60 links do not weigh on every page's HTML and RSC payload (mobile LCP).
 * Opens on click / Enter / Space, or on hover with intent delays; closes on Esc (focus returns to
 * the button), on focus leaving the menu, on pointer leave (300ms) and on navigation.
 * The panel is positioned against the nearest `relative` ancestor (the CategoryNav bar).
 */
export function MegaMenu({
  label,
  examTypes,
  subjects,
}: {
  label: string;
  examTypes: ExamTypeMini[];
  subjects: SubjectMini[];
}) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pathname = usePathname();

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    if (next) setRendered(true);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      ref={root}
      className="hidden md:block"
      onPointerEnter={(e) => e.pointerType === "mouse" && schedule(true, OPEN_DELAY)}
      onPointerLeave={(e) => e.pointerType === "mouse" && schedule(false, CLOSE_DELAY)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          window.clearTimeout(timer.current);
          setRendered(true);
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-control bg-primary px-3 text-sm font-bold text-white hover:bg-primary-hover aria-expanded:bg-primary-hover"
      >
        {label}
        <ChevronIcon size={16} className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="absolute inset-x-0 top-full z-30 border-b border-line bg-surface shadow-raised"
      >
        {rendered && <ExamSubjectPanel examTypes={examTypes} subjects={subjects} />}
      </div>
    </div>
  );
}

/**
 * Desktop mega menu panel: one column per exam (heading → exam hub /exam/<slug>), each listing the
 * subjects (exam × subject search), then a row of subject hubs (/subject/<slug>, package ب).
 */
function ExamSubjectPanel({ examTypes, subjects }: { examTypes: ExamTypeMini[]; subjects: SubjectMini[] }) {
  return (
    <div className="mx-auto max-w-site px-4 py-5">
      <div className="grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(${Math.min(examTypes.length, 5)}, minmax(0, 1fr))` }}>
        {examTypes.map((exam) => {
          const headingId = `mega-exam-${exam.id}`;
          return (
            <section key={exam.id} aria-labelledby={headingId}>
              <h3 id={headingId} className="border-b border-line pb-1">
                <Link
                  prefetch={false}
                  href={routes.exam(exam.slug)}
                  className="inline-flex min-h-11 items-center text-sm font-extrabold text-primary hover:underline"
                >
                  آزمون {exam.name}
                </Link>
              </h3>
              <ul className="mt-1">
                {subjects.map((s) => (
                  <li key={s.id}>
                    <Link
                      prefetch={false}
                      href={routes.search({ exam_type: exam.slug, subject: s.slug })}
                      className="flex min-h-11 items-center rounded-control px-1 text-sm text-ink hover:bg-primary-soft hover:text-primary"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    prefetch={false}
                    href={routes.exam(exam.slug)}
                    className="flex min-h-11 items-center px-1 text-sm font-bold text-primary underline-offset-4 hover:underline"
                  >
                    مشاهده همه منابع {exam.short_name || exam.name}
                  </Link>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <section aria-labelledby="mega-subject-hubs" className="mt-4 border-t border-line pt-3">
        <h3 id="mega-subject-hubs" className="text-sm font-extrabold text-ink-muted">
          صفحه هر درس
        </h3>
        <ul className="mt-1 flex flex-wrap gap-x-1">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link
                prefetch={false}
                href={routes.subject(s.slug)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm text-ink hover:bg-primary-soft hover:text-primary"
              >
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-4">
        {[
          { href: routes.kit, label: "بسته مطالعاتی آزمون" },
          { href: routes.search({ quick_review: "true" }), label: "سریع‌خوان و جمع‌بندی" },
          { href: routes.search({ format: "ebook" }), label: "کتاب‌های الکترونیک" },
          { href: routes.search(), label: "همه کتاب‌ها" },
        ].map((l) => (
          <Link
            key={l.href}
            prefetch={false}
            href={l.href}
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-bold text-ink hover:border-primary hover:bg-primary-soft"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
