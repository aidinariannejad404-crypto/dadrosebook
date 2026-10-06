"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { reportCaptureEvent } from "@/lib/reader";
import { BAND_HINT, CLIPBOARD_NOTICE, GUARD_MESSAGE, createGuard, traceTile, type Guard } from "@/lib/screen-guard";
import { LockIcon } from "@/components/ui/Icons";
import type { ReaderTheme } from "./theme";

/**
 * Phase 6c screenshot deterrence shared by the PDF and EPUB readers.
 *
 * The blank state is written straight to `<html data-screen-guard="on">` inside the event handler
 * (no React render, no transition): globals.css then hides the whole reader (`visibility: hidden`)
 * and shows the opaque white overlay, so the very next frame painted holds nothing of the book.
 */

const GUARD_ATTR = "data-screen-guard";
const BAND_HINT_KEY = "dadrose.reader.bandHint";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function finePointer(): boolean {
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return false;
  }
}

/** Installs the guard's listeners for the reader's lifetime; returns a ref to the guard (for «restore»). */
export function useScreenGuard(slug: string) {
  const guardRef = useRef<Guard | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const guard = createGuard({
      onChange: (blank) => {
        if (blank) root.setAttribute(GUARD_ATTR, "on");
        else root.removeAttribute(GUARD_ATTR);
      },
      onReport: (kind) => reportCaptureEvent(slug, kind),
      onPrintScreen: () => {
        try {
          void navigator.clipboard?.writeText(CLIPBOARD_NOTICE).catch(() => undefined);
        } catch {
          /* no clipboard access */
        }
      },
    });
    guardRef.current = guard;
    if (document.visibilityState === "hidden") guard.input({ type: "hidden" });

    const onKey = (e: KeyboardEvent) =>
      guard.input({
        type: e.type === "keydown" ? "keydown" : "keyup",
        key: e.key ?? "",
        code: e.code,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        typing: isTypingTarget(e.target),
      });
    const onBlur = () => guard.input({ type: "blur" });
    const onFocus = () => guard.input({ type: "focus" });
    const onVisibility = () => guard.input({ type: document.visibilityState === "hidden" ? "hidden" : "visible" });
    const onHide = () => guard.input({ type: "hidden" });
    const onShow = () => guard.input({ type: "visible" });
    const onTouch = (e: TouchEvent) => guard.input({ type: "touches", count: e.touches.length, start: e.type === "touchstart" });
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && finePointer()) guard.input({ type: "pointerout" });
    };
    const onMouseLeave = () => {
      if (finePointer()) guard.input({ type: "pointerout" });
    };
    const onMouseIn = () => {
      if (guard.reason() === "pointer") guard.input({ type: "pointerin" });
    };
    const onBeforePrint = () => guard.input({ type: "beforeprint" });
    const onAfterPrint = () => guard.input({ type: "afterprint" });

    const opts = { capture: true } as const;
    const touchOpts = { capture: true, passive: true } as const;
    window.addEventListener("keydown", onKey, opts);
    window.addEventListener("keyup", onKey, opts);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("freeze", onHide);
    document.addEventListener("resume", onShow);
    window.addEventListener("touchstart", onTouch, touchOpts);
    window.addEventListener("touchend", onTouch, touchOpts);
    window.addEventListener("touchcancel", onTouch, touchOpts);
    document.addEventListener("mouseout", onMouseOut);
    root.addEventListener("mouseleave", onMouseLeave);
    root.addEventListener("mouseenter", onMouseIn);
    document.addEventListener("mouseover", onMouseIn);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("keydown", onKey, opts);
      window.removeEventListener("keyup", onKey, opts);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("freeze", onHide);
      document.removeEventListener("resume", onShow);
      window.removeEventListener("touchstart", onTouch, touchOpts);
      window.removeEventListener("touchend", onTouch, touchOpts);
      window.removeEventListener("touchcancel", onTouch, touchOpts);
      document.removeEventListener("mouseout", onMouseOut);
      root.removeEventListener("mouseleave", onMouseLeave);
      root.removeEventListener("mouseenter", onMouseIn);
      document.removeEventListener("mouseover", onMouseIn);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      guard.dispose();
      guardRef.current = null;
      root.removeAttribute(GUARD_ATTR);
    };
  }, [slug]);

  return guardRef;
}

/** The blank overlay (hidden until `<html data-screen-guard="on">`). Render it inside ReaderShell. */
export function ScreenGuard({ slug }: { slug: string }) {
  const guardRef = useScreenGuard(slug);
  return (
    <button
      type="button"
      className="screen-guard-overlay"
      onClick={() => {
        guardRef.current?.input({ type: "restore" });
        window.focus();
      }}
    >
      <LockIcon size={40} />
      <span className="text-base font-bold leading-8">{GUARD_MESSAGE}</span>
    </button>
  );
}

/** Dense, faint trace-code tiles over the page (never selectable or clickable). */
export function TraceLayer({ code, theme }: { code: string; theme: ReaderTheme }) {
  if (!code) return null;
  return (
    <div
      aria-hidden="true"
      data-trace-layer=""
      className="pointer-events-none absolute inset-0 select-none"
      style={{ backgroundImage: traceTile(code, theme), backgroundRepeat: "repeat" }}
    />
  );
}

/** «کد: K7Q2-M9XD» in tiny type for the reader footer. */
export function TraceCodeLabel({ code, className = "" }: { code: string; className?: string }) {
  if (!code) return null;
  return (
    <span className={`select-none text-[10px] leading-4 text-ink-muted ${className}`}>
      کد: <bdi dir="ltr" className="font-mono font-bold tracking-wider">{code}</bdi>
    </span>
  );
}

/** Show the reading-band hint once per browser. */
export function useBandHint(enabled: boolean, flash: (msg: string) => void) {
  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem(BAND_HINT_KEY)) return;
      window.localStorage.setItem(BAND_HINT_KEY, "1");
    } catch {
      /* storage unavailable: show it this time */
    }
    flash(BAND_HINT);
  }, [enabled, flash]);
}

const SWIPE_MIN_PX = 50;
const DRAG_MIN_PX = 8;

/**
 * «حالت نوار مطالعه» (protection level «high»): only the band [top, top + height) of the container
 * stays sharp; above and below are blurred (opaque fill where backdrop-filter is unsupported).
 * Interactive (EPUB paged mode): tap or drag on the blurred part moves the band; a horizontal swipe
 * turns the page. Otherwise the masks let every pointer event through (the content scrolls under the band).
 */
export function ReadingBand({
  top,
  height,
  interactive = false,
  onPoint,
  onSwipe,
  onWheel,
}: {
  top: number;
  height: number;
  interactive?: boolean;
  /** y relative to the container */
  onPoint?: (y: number) => void;
  /** horizontal swipe distance (px, physical: > 0 = to the right) */
  onSwipe?: (dx: number) => void;
  onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
}) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const relY = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    return e.clientY - (box?.top ?? 0);
  }, []);

  const handlers = interactive
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dy) > DRAG_MIN_PX && Math.abs(dy) > Math.abs(dx)) d.moved = true;
          if (d.moved) onPoint?.(relY(e));
        },
        onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe?.(dx);
          else onPoint?.(relY(e));
        },
        onPointerCancel: () => {
          drag.current = null;
        },
        onWheel,
      }
    : {};
  const cls = `reading-band-mask absolute inset-x-0 select-none ${interactive ? "touch-none cursor-pointer" : "pointer-events-none"}`;

  return (
    <>
      <div aria-hidden="true" className={cls} style={{ top: 0, height: Math.max(0, top) }} {...handlers} />
      <div aria-hidden="true" className="reading-band-edge pointer-events-none absolute inset-x-0" style={{ top, height }} />
      <div aria-hidden="true" className={cls} style={{ top: top + height, bottom: 0 }} {...handlers} />
    </>
  );
}
