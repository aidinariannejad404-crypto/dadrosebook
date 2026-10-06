"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Book3D.module.css";

/** Resting pose matches `.product` in Book3D.module.css; the pointer adds at most ±MAX degrees. */
const REST_Y = -26;
const REST_X = 2;
const MAX_Y = 16;
const MAX_X = 9;

/**
 * Product-page tilt: the 3D book follows the pointer. Only on fine pointers with hover and when
 * motion is allowed — touch devices and reduced-motion users keep the CSS resting angle.
 * Writes two CSS variables once per animation frame; the rect is cached on pointerenter so
 * pointermove never forces layout.
 */
export function BookTilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!mq.matches) return;

    let rect: DOMRect | null = null;
    let frame = 0;
    let nx = 0;
    let ny = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--ry", `${(REST_Y + nx * MAX_Y).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(REST_X - ny * MAX_X).toFixed(2)}deg`);
    };
    const onEnter = () => {
      rect = el.getBoundingClientRect();
      el.classList.add(styles.tilting!);
    };
    const onMove = (e: PointerEvent) => {
      if (!rect) rect = el.getBoundingClientRect();
      nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      rect = null;
      el.classList.remove(styles.tilting!);
      el.style.removeProperty("--ry");
      el.style.removeProperty("--rx");
    };
    const invalidate = () => {
      rect = null;
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      onLeave();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
