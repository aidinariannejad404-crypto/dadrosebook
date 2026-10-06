"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { HIGHLIGHT_COLORS, mergeRects, rectsToFractions } from "@/lib/reader";
import { locateInChunks } from "@/lib/reader-anchor";
import type { FractionRect, Highlight } from "@/lib/types";
import { tracePlacements } from "@/lib/screen-guard";
import { loadPdfjs, type PdfDocument } from "./pdfjs";

interface PdfPageViewProps {
  doc: PdfDocument;
  pageNumber: number;
  /** Target CSS width of the page in px (fit-to-width × zoom). */
  cssWidth: number;
  watermark: string;
  /** Phase 6c: per user+book trace code, burned in densely and faintly */
  traceCode?: string;
  highlights: Highlight[];
  activeHighlightId?: number | null;
  /** Pre-render only (kept out of view and out of the accessibility tree). */
  hidden?: boolean;
  /** A tap/click on the page with no text selected, in page fractions. */
  onPageClick?: (x: number, y: number) => void;
  /** د۵ sample: false = no text layer (nothing to select, highlight or copy) */
  selectable?: boolean;
}

const SWATCH = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.value, c.swatch]));
/** Watermark ink: the brand text colour at low alpha (canvas cannot read CSS variables cheaply). */
const WATERMARK_FILL = "rgba(16, 24, 43, 0.11)";

/**
 * Burn the watermark into the rendered canvas (diagonal, repeated). Drawing it into the pixels
 * means removing a DOM node does not remove it.
 */
function drawWatermark(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !text) return;
  const w = canvas.width;
  const h = canvas.height;
  const fontPx = Math.max(14, Math.round(w / 26));
  const family = getComputedStyle(document.body).fontFamily || "Tahoma, sans-serif";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `600 ${fontPx}px ${family}`;
  ctx.fillStyle = WATERMARK_FILL;
  ctx.direction = "ltr"; // masked phone + date read in LTR order (Persian digits are EN class)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = ctx.measureText(text).width + fontPx * 3;
  const stepY = fontPx * 5;
  const half = Math.hypot(w, h) / 2;
  let row = 0;
  for (let y = -half; y <= half; y += stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0;
    for (let x = -half - stepX; x <= half + stepX; x += stepX) ctx.fillText(text, x + offset, y);
  }
  ctx.restore();
}

/**
 * ه۱: boxes for highlights the server moved to this page after a new file version (`rects: []`),
 * found again in the text layer by compact text comparison.
 */
function deriveRects(box: HTMLDivElement, textDiv: HTMLDivElement, missing: Highlight[]): Record<number, FractionRect[]> {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(textDiv, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  if (!nodes.length) return {};
  const chunks = nodes.map((n) => n.data);
  const frame = box.getBoundingClientRect();
  const out: Record<number, FractionRect[]> = {};
  for (const h of missing) {
    const hit = locateInChunks(chunks, h.text, h.context_before ?? "");
    if (!hit) continue;
    const range = document.createRange();
    range.setStart(nodes[hit.start.chunk]!, hit.start.offset);
    range.setEnd(nodes[hit.end.chunk]!, hit.end.offset);
    const rects = mergeRects(rectsToFractions(Array.from(range.getClientRects()), frame));
    if (rects.length) out[h.id] = rects;
  }
  return out;
}

/** Trace ink: ≈6% of the text colour; the theme filters (sepia/dark invert) adapt it with the page. */
const TRACE_FILL = "rgba(16, 24, 43, 0.065)";

/**
 * Burn the trace code into the canvas as a dense jittered grid (small, rotated): faint while
 * reading, legible once a screenshot's contrast is raised.
 */
function drawTraceCode(canvas: HTMLCanvasElement, code: string, dpr: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !code) return;
  const fontPx = Math.round(11 * dpr);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `700 ${fontPx}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = TRACE_FILL;
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const stepX = ctx.measureText(code).width + fontPx * 3;
  const stepY = fontPx * 4.5;
  for (const p of tracePlacements(code, canvas.width, canvas.height, stepX, stepY)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.angle * Math.PI) / 180);
    ctx.fillText(code, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export interface PdfPageHandle {
  /** The page box (canvas + layers) used to turn selection rects into fractions. */
  element: HTMLDivElement | null;
}

/** One PDF page: canvas sized for devicePixelRatio, selectable text layer, highlights. */
export const PdfPageView = forwardRef<PdfPageHandle, PdfPageViewProps>(function PdfPageView(
  { doc, pageNumber, cssWidth, watermark, traceCode = "", highlights, activeHighlightId, hidden = false, onPageClick, selectable = true },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // ه۱: text layer ready (bumped after each render) → boxes derived for highlights without rects
  const [textReady, setTextReady] = useState(0);
  const [derived, setDerived] = useState<Record<number, FractionRect[]>>({});

  useImperativeHandle(ref, () => ({ get element() { return boxRef.current; } }), []);

  useEffect(() => {
    if (cssWidth <= 0) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: { cancel: () => void } | null = null;

    (async () => {
      const lib = await loadPdfjs();
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const viewport = page.getViewport({ scale });
      const box = boxRef.current;
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!box || !canvas || !textDiv) return;

      box.style.setProperty("--scale-factor", String(scale));
      box.style.setProperty("--total-scale-factor", String(scale));
      setSize({ w: viewport.width, h: viewport.height });

      // Render off-screen first so zooming does not flash a blank page.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width * dpr);
      off.height = Math.floor(viewport.height * dpr);
      renderTask = page.render({
        canvas: off,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (cancelled) return;
      drawWatermark(off, watermark);
      drawTraceCode(off, traceCode, dpr);
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
      off.width = 0;
      off.height = 0;

      textDiv.replaceChildren();
      if (!selectable) return;
      const layer = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
      textLayer = layer;
      await layer.render();
      if (!cancelled) setTextReady((n) => n + 1);
    })().catch((err: unknown) => {
      if (cancelled) return;
      if (err instanceof Error && (err.name === "RenderingCancelledException" || err.name === "AbortException")) return;
      setFailed(true);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, pageNumber, cssWidth, watermark, traceCode, selectable]);

  useEffect(() => {
    const box = boxRef.current;
    const textDiv = textRef.current;
    const missing = highlights.filter((h) => !h.rects.length && h.text);
    if (!textReady || !box || !textDiv || !missing.length) return setDerived({});
    setDerived(deriveRects(box, textDiv, missing));
  }, [textReady, highlights]);

  const style = size ? { width: `${size.w}px`, height: `${size.h}px` } : { width: `${cssWidth}px`, aspectRatio: "1 / 1.414" };

  return (
    <div
      ref={boxRef}
      data-page={pageNumber}
      aria-hidden={hidden || undefined}
      className={`reader-page relative mx-auto select-none bg-white shadow-raised ${hidden ? "hidden" : ""}`}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        if (!onPageClick || !boxRef.current) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        const r = boxRef.current.getBoundingClientRect();
        onPageClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" draggable={false} />
      {/* highlights sit under the transparent text layer so selection keeps working */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {highlights.flatMap((h) =>
          (h.rects.length ? h.rects : (derived[h.id] ?? [])).map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className={`reader-highlight absolute rounded-[2px] ${h.id === activeHighlightId ? "reader-highlight-active" : ""}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                backgroundColor: SWATCH[h.color],
              }}
            />
          )),
        )}
      </div>
      <div ref={textRef} className="textLayer" />
      {failed && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-control bg-danger-soft p-3 text-center text-sm font-bold text-danger">
          نمایش این صفحه ممکن نشد.
        </p>
      )}
    </div>
  );
});
