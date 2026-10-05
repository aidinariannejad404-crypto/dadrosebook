"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { routes } from "@/lib/config";
import { accountRoutes } from "@/lib/account-routes";
import { formatJalaliDate } from "@/lib/format";
import { HIGHLIGHT_COLORS, removeDevice, type ReaderError } from "@/lib/reader";
import type { HighlightColor, ReaderDevice } from "@/lib/types";
import { CloseIcon, HighlighterIcon, NoteIcon } from "@/components/ui/Icons";
import type { ReaderTheme } from "./theme";

/** Shared pieces of the PDF and EPUB readers (shell, messages, error screens, popover, drawer). */

export function ReaderShell({ theme, children }: { theme: ReaderTheme; children: ReactNode }) {
  return (
    <>
      <div data-reader-theme={theme} className="reader-root fixed inset-0 z-40 flex flex-col bg-surface-muted text-ink">
        {children}
      </div>
      <p className="reader-print-block hidden p-8 text-center text-lg font-bold">چاپ کتاب الکترونیک امکان‌پذیر نیست.</p>
    </>
  );
}

export function ReaderMessage({
  theme,
  title,
  body,
  children,
}: {
  theme: ReaderTheme;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <ReaderShell theme={theme}>
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-md rounded-card bg-surface p-6 text-center shadow-card">
          <span aria-hidden="true" className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
            <HighlighterIcon size={28} />
          </span>
          <h1 className="text-lg font-bold leading-8">{title}</h1>
          {body && <p className="mt-2 text-sm leading-7 text-ink-muted">{body}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>
        </div>
      </div>
    </ReaderShell>
  );
}

export function ActionLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-5 font-bold ${
        primary ? "bg-primary text-surface hover:bg-primary-hover" : "text-primary hover:bg-primary-soft"
      }`}
    >
      {children}
    </Link>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-surface hover:bg-primary-hover"
    >
      تلاش دوباره
    </button>
  );
}

export type ReaderFatalError = ReaderError | { kind: "load" };

/** Full-screen error states shared by both readers (auth, entitlement, device limit, throttling…). */
export function ReaderErrorView({
  slug,
  theme,
  error,
  onRetry,
}: {
  slug: string;
  theme: ReaderTheme;
  error: ReaderFatalError;
  onRetry: () => void;
}) {
  const productHref = routes.product(slug);
  const e = error;
  if (e.kind === "auth") {
    const loginHref = `${routes.login}?next=${encodeURIComponent(routes.read(slug))}`;
    return (
      <ReaderMessage theme={theme} title="برای مطالعه وارد حساب خود شوید">
        <ActionLink href={loginHref} primary>
          ورود / ثبت‌نام
        </ActionLink>
        <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
      </ReaderMessage>
    );
  }
  if (e.kind === "forbidden") {
    return (
      <ReaderMessage
        theme={theme}
        title="این کتاب الکترونیک در کتابخانه شما نیست"
        body="برای مطالعه، نسخه الکترونیک این کتاب را از صفحه کتاب تهیه کنید."
      >
        <ActionLink href={productHref} primary>
          مشاهده و خرید کتاب
        </ActionLink>
      </ReaderMessage>
    );
  }
  if (e.kind === "no_ebook") {
    return (
      <ReaderMessage theme={theme} title="نسخه الکترونیک این کتاب هنوز آماده نیست">
        <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
      </ReaderMessage>
    );
  }
  if (e.kind === "device_limit") {
    return <DeviceLimitView theme={theme} devices={e.devices} productHref={productHref} onRetry={onRetry} />;
  }
  if (e.kind === "throttled") {
    return (
      <ReaderMessage theme={theme} title="کمی صبر کنید و دوباره تلاش کنید" body="درخواست‌های زیادی در زمان کوتاه فرستاده شد.">
        <RetryButton onClick={onRetry} />
        <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
      </ReaderMessage>
    );
  }
  return (
    <ReaderMessage
      theme={theme}
      title={e.kind === "load" ? "باز کردن کتاب ممکن نشد" : "اتصال برقرار نشد"}
      body="اینترنت خود را بررسی کنید و دوباره تلاش کنید."
    >
      <RetryButton onClick={onRetry} />
      <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
    </ReaderMessage>
  );
}

function DeviceLimitView({
  theme,
  devices,
  productHref,
  onRetry,
}: {
  theme: ReaderTheme;
  devices: ReaderDevice[];
  productHref: string;
  onRetry: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const remove = async (d: ReaderDevice) => {
    setBusyId(d.id);
    setMessage("");
    const res = await removeDevice(d.id);
    setBusyId(null);
    if (res.ok) return onRetry();
    setMessage(
      res.error.kind === "throttled"
        ? "امروز بیش از حد مجاز دستگاه حذف کرده‌اید. کمی صبر کنید و دوباره تلاش کنید."
        : "حذف دستگاه انجام نشد. دوباره تلاش کنید.",
    );
  };

  return (
    <ReaderMessage
      theme={theme}
      title="سقف دستگاه‌های مطالعه پر شده است"
      body="کتاب‌های الکترونیک شما روی تعداد محدودی دستگاه خوانده می‌شوند. برای مطالعه روی این دستگاه، یکی از دستگاه‌های قبلی را حذف کنید."
    >
      <ul className="w-full space-y-2 text-start">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-control border border-line p-2 ps-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold" dir="auto">
                {d.label || "دستگاه ناشناس"}
              </span>
              {d.last_seen && (
                <span className="block text-xs text-ink-muted">آخرین استفاده: {formatJalaliDate(d.last_seen)}</span>
              )}
            </span>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void remove(d)}
              aria-label={`حذف دستگاه ${d.label}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
            >
              {busyId === d.id ? "در حال حذف…" : "حذف"}
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="w-full text-sm leading-7 text-danger">
        {message}
      </p>
      <ActionLink href={accountRoutes.devices}>مدیریت دستگاه‌های من</ActionLink>
      <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
    </ReaderMessage>
  );
}

/** Colour swatches + «یادداشت» shown under a text selection. */
export function SelectionPopover({
  anchor,
  busy,
  onColor,
  onNote,
}: {
  anchor: { x: number; y: number };
  busy: boolean;
  onColor: (c: HighlightColor) => void;
  onNote: () => void;
}) {
  const WIDTH = 288;
  const vw = typeof window === "undefined" ? 360 : window.innerWidth;
  const vh = typeof window === "undefined" ? 640 : window.innerHeight;
  // physical coordinates from the selection's client rect (positioning only; classes stay logical)
  const x = Math.min(Math.max(anchor.x - WIDTH / 2, 8), vw - WIDTH - 8);
  const y = Math.max(8, Math.min(anchor.y + 12, vh - 140));
  return (
    <div
      role="toolbar"
      aria-label="هایلایت متن انتخاب‌شده"
      className="fixed z-50 flex items-center gap-1 rounded-card border border-line bg-surface p-1.5 shadow-raised"
      style={{ left: x, top: y, width: WIDTH }}
      // keep the text selection alive while pressing a button
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          disabled={busy}
          onClick={() => onColor(c.value)}
          aria-label={`هایلایت ${c.label}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-primary-soft disabled:opacity-60"
        >
          <span aria-hidden="true" className="size-7 rounded-full border-2 border-line-strong" style={{ backgroundColor: c.swatch }} />
        </button>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={onNote}
        className="ms-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-control px-3 text-sm font-bold text-primary hover:bg-primary-soft disabled:opacity-60"
      >
        <NoteIcon size={18} />
        یادداشت
      </button>
    </div>
  );
}

/** Short status toast («متن با ذکر منبع کپی شد»…). */
export function ReaderNotice({ text }: { text: string }) {
  return (
    <p
      role="status"
      className={`pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto w-fit max-w-sm rounded-control bg-ink px-4 py-2 text-center text-sm text-surface shadow-raised transition-opacity ${
        text ? "opacity-100" : "opacity-0"
      }`}
    >
      {text}
    </p>
  );
}

/**
 * Side drawer on the native <dialog> (focus containment, Esc, backdrop click; focus returns to the
 * opener) docked to the inline-end edge — the HighlightsDrawer pattern, reused by TOC and search.
 */
export function ReaderDrawer({
  open,
  onClose,
  title,
  children,
  side = "end",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "start" | "end";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-0 ${side === "end" ? "ms-auto" : "me-auto"} h-dvh max-h-dvh w-[min(24rem,100%)] max-w-full bg-surface p-0 text-ink shadow-raised backdrop:bg-[color-mix(in_srgb,var(--color-text)_60%,transparent)]`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-me-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-ink"
            aria-label="بستن"
          >
            <CloseIcon size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
