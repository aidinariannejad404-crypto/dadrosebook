"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { routes } from "@/lib/config";
import { formatNumber, formatPercent, toPersianDigits } from "@/lib/format";
import {
  HIGHLIGHT_COLORS,
  PROGRESS_SAVE_DELAY_MS,
  clampPage,
  createHighlight,
  debounce,
  deleteHighlight,
  getReaderSession,
  listHighlights,
  mergeRects,
  needsUrlRefresh,
  parsePageInput,
  pointInRects,
  progressPercent,
  rectsToFractions,
  saveProgress,
  updateHighlight,
  type ReaderError,
} from "@/lib/reader";
import type { FractionRect, Highlight, HighlightColor, ReaderSession } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChevronIcon, HighlighterIcon, MinusIcon, NoteIcon, PlusIcon } from "@/components/ui/Icons";
import { PdfPageView, type PdfPageHandle } from "./PdfPageView";
import { HighlightsDrawer } from "./HighlightsDrawer";
import { HighlightEditor } from "./HighlightEditor";
import { isInvalidPdfError, openPdf, type PdfDocument } from "./pdfjs";
import { ReaderThemeToggle } from "./ReaderThemeToggle";
import { initialReaderTheme, saveReaderTheme, type ReaderTheme } from "./theme";

type State =
  | { status: "loading" }
  | { status: "error"; error: ReaderError | { kind: "load" } }
  | { status: "epub"; session: ReaderSession }
  | { status: "ready"; session: ReaderSession; doc: PdfDocument; total: number };

interface PendingSelection {
  text: string;
  rects: FractionRect[];
  page: number;
  /** viewport point under the selection (popover anchor) */
  anchor: { x: number; y: number };
}

type Editor =
  | { mode: "create"; selection: PendingSelection }
  | { mode: "edit"; highlight: Highlight }
  | null;

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2, 2.5];
const MAX_PAGE_WIDTH = 900;
const STAGE_GUTTER = 16;
const SWIPE_MIN_PX = 60;

/** Open the PDF, refreshing the signed URL first when it is about to expire and once more on failure. */
async function openWithRefresh(
  slug: string,
  session: ReaderSession,
): Promise<{ session: ReaderSession; doc: PdfDocument } | { error: ReaderError | { kind: "load" } }> {
  let current = session;
  if (needsUrlRefresh(current.file.expires_at)) {
    const again = await getReaderSession(slug);
    if (!again.ok) return { error: again.error };
    current = again.data;
  }
  try {
    return { session: current, doc: await openPdf(current.file.url) };
  } catch (err) {
    if (isInvalidPdfError(err)) return { error: { kind: "load" } };
  }
  // The URL may have expired (or the token was rejected): mint a new one and retry once.
  const again = await getReaderSession(slug);
  if (!again.ok) return { error: again.error };
  try {
    return { session: again.data, doc: await openPdf(again.data.file.url) };
  } catch {
    return { error: { kind: "load" } };
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function Reader({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [theme, setThemeState] = useState<ReaderTheme>("light");

  useEffect(() => {
    setThemeState(initialReaderTheme());
  }, []);
  const setTheme = useCallback((t: ReaderTheme) => {
    setThemeState(t);
    saveReaderTheme(t);
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<PdfPageHandle>(null);
  const lastSaved = useRef<number | null>(null);
  const pageNow = useRef(page);
  const totalNow = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pageInputId = useId();

  const ready = state.status === "ready" ? state : null;
  const total = ready?.total ?? 0;
  const zoom = ZOOM_LEVELS[zoomIndex] ?? 1;
  const fitWidth = Math.min(Math.max(stageWidth - STAGE_GUTTER * 2, 200), MAX_PAGE_WIDTH);
  const cssWidth = stageWidth > 0 ? Math.floor(fitWidth * zoom) : 0;

  pageNow.current = page;
  totalNow.current = total;

  /* ---------- load session + document ---------- */
  useEffect(() => {
    let cancelled = false;
    let opened: PdfDocument | null = null;
    setState({ status: "loading" });
    (async () => {
      const res = await getReaderSession(slug);
      if (cancelled) return;
      if (!res.ok) return setState({ status: "error", error: res.error });
      if (res.data.file.format !== "PDF") return setState({ status: "epub", session: res.data });
      const out = await openWithRefresh(slug, res.data);
      if ("error" in out) {
        if (!cancelled) setState({ status: "error", error: out.error });
        return;
      }
      opened = out.doc;
      if (cancelled) {
        void out.doc.destroy();
        return;
      }
      const totalPages = out.doc.numPages;
      const start = clampPage(out.session.progress?.page ?? 1, totalPages);
      lastSaved.current = out.session.progress?.page ?? null;
      setPage(start);
      setState({ status: "ready", session: out.session, doc: out.doc, total: totalPages });
      const hl = await listHighlights(slug);
      if (!cancelled && hl.ok) setHighlights(hl.data);
    })().catch(() => {
      if (!cancelled) setState({ status: "error", error: { kind: "network" } });
    });
    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [slug, attempt]);

  /* ---------- stage width (fit to width) ---------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.status]);

  /* ---------- progress ---------- */
  const saver = useMemo(
    () =>
      debounce((p: number, t: number) => {
        lastSaved.current = p;
        void saveProgress(slug, { page: p, total_pages: t });
      }, PROGRESS_SAVE_DELAY_MS),
    [slug],
  );

  useEffect(() => {
    if (!ready || page === lastSaved.current) return;
    saver(page, ready.total);
  }, [page, ready, saver]);

  useEffect(() => {
    const flushNow = () => {
      saver.cancel();
      const p = pageNow.current;
      const t = totalNow.current;
      if (t > 0 && p !== lastSaved.current) {
        lastSaved.current = p;
        void saveProgress(slug, { page: p, total_pages: t }, { keepalive: true });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, [saver, slug]);

  /* ---------- navigation ---------- */
  const goTo = useCallback(
    (n: number) => {
      if (!totalNow.current) return;
      const next = clampPage(n, totalNow.current);
      setPending(null);
      setPage(next);
      window.getSelection()?.removeAllRanges();
      stageRef.current?.scrollTo({ top: 0 });
    },
    [],
  );
  const nextPage = useCallback(() => goTo(pageNow.current + 1), [goTo]);
  const prevPage = useCallback(() => goTo(pageNow.current - 1), [goTo]);

  useEffect(() => {
    setPageInput(toPersianDigits(page));
  }, [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // deterrent only: the file itself is never offered for saving/printing
      if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      // RTL book: the next page is to the left
      if (e.key === "ArrowLeft" || e.key === "PageDown") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "ArrowRight" || e.key === "PageUp") {
        e.preventDefault();
        prevPage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextPage, prevPage]);

  /* ---------- selection → highlight popover ---------- */
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      const sel = window.getSelection();
      const box = pageRef.current?.element;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !box) return setPending(null);
      const range = sel.getRangeAt(0);
      const layer = box.querySelector(".textLayer");
      if (!layer || !layer.contains(range.commonAncestorContainer)) return setPending(null);
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (!text) return setPending(null);
      const rects = mergeRects(rectsToFractions(Array.from(range.getClientRects()), box.getBoundingClientRect()));
      if (!rects.length) return setPending(null);
      const b = range.getBoundingClientRect();
      setPending({ text, rects, page: pageNow.current, anchor: { x: b.left + b.width / 2, y: b.bottom } });
    };
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 250);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4000);
  }, []);

  const create = useCallback(
    async (sel: PendingSelection, color: HighlightColor, note = "") => {
      setBusy(true);
      const res = await createHighlight(slug, { page: sel.page, text: sel.text, rects: sel.rects, color, note });
      setBusy(false);
      if (!res.ok) {
        flash("ذخیره هایلایت انجام نشد. دوباره تلاش کنید.");
        return false;
      }
      setHighlights((list) => [...list, res.data]);
      setPending(null);
      window.getSelection()?.removeAllRanges();
      flash("هایلایت ذخیره شد.");
      return true;
    },
    [slug, flash],
  );

  const saveEditor = useCallback(
    async ({ color, note }: { color: HighlightColor; note: string }) => {
      if (!editor) return;
      if (editor.mode === "create") {
        if (await create(editor.selection, color, note)) setEditor(null);
        return;
      }
      setBusy(true);
      const res = await updateHighlight(slug, editor.highlight.id, { color, note });
      setBusy(false);
      if (!res.ok) return flash("ذخیره تغییرات انجام نشد. دوباره تلاش کنید.");
      setHighlights((list) => list.map((h) => (h.id === res.data.id ? res.data : h)));
      setEditor(null);
    },
    [editor, create, slug, flash],
  );

  const removeHighlight = useCallback(async () => {
    if (editor?.mode !== "edit") return;
    setBusy(true);
    const res = await deleteHighlight(slug, editor.highlight.id);
    setBusy(false);
    if (!res.ok) return flash("حذف هایلایت انجام نشد. دوباره تلاش کنید.");
    const id = editor.highlight.id;
    setHighlights((list) => list.filter((h) => h.id !== id));
    setEditor(null);
    flash("هایلایت حذف شد.");
  }, [editor, slug, flash]);

  const pageHighlights = useMemo(() => highlights.filter((h) => h.page === page), [highlights, page]);
  const nextHighlights = useMemo(() => highlights.filter((h) => h.page === page + 1), [highlights, page]);

  const onPageClick = useCallback(
    (x: number, y: number) => {
      const hit = [...pageHighlights].reverse().find((h) => pointInRects(x, y, h.rects));
      if (hit) setEditor({ mode: "edit", highlight: hit });
    },
    [pageHighlights],
  );

  /* ---------- render ---------- */
  const productHref = routes.product(slug);

  if (state.status === "loading") return <ReaderSkeleton slug={slug} theme={theme} />;

  if (state.status === "error") {
    const e = state.error;
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
    return (
      <ReaderMessage
        theme={theme}
        title={e.kind === "load" ? "باز کردن کتاب ممکن نشد" : "اتصال برقرار نشد"}
        body="اینترنت خود را بررسی کنید و دوباره تلاش کنید."
      >
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-surface hover:bg-primary-hover"
        >
          تلاش دوباره
        </button>
        <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
      </ReaderMessage>
    );
  }

  if (state.status === "epub") {
    return (
      <ReaderMessage theme={theme} title="نسخه EPUB به‌زودی در کتابخوان پشتیبانی می‌شود" body={state.session.book.title}>
        <ActionLink href={productHref}>بازگشت به صفحه کتاب</ActionLink>
      </ReaderMessage>
    );
  }

  const { session, doc } = state;
  const percent = progressPercent(page, total);
  const pageLabel = `صفحه ${formatNumber(page)} از ${formatNumber(total)}`;

  return (
    <ReaderShell theme={theme}>
      {/* top bar */}
      <header className="relative border-b border-line bg-surface">
        <div className="flex items-center gap-2 px-2 py-1.5 sm:px-4">
          <Link
            href={productHref}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-primary hover:bg-primary-soft"
            aria-label="بازگشت به صفحه کتاب"
          >
            <ChevronIcon size={22} className="rotate-180" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold sm:text-base">{session.book.title}</h1>
            <p className="text-xs text-ink-muted" aria-live="polite">
              {pageLabel}
            </p>
          </div>
          <ReaderThemeToggle value={theme} onChange={setTheme} />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            <HighlighterIcon size={22} />
            <span className="hidden md:inline">هایلایت‌ها و یادداشت‌ها</span>
            <span className="sr-only md:hidden">هایلایت‌ها و یادداشت‌ها</span>
            {highlights.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-[color:var(--color-on-accent)]">{formatNumber(highlights.length)}</span>
            )}
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="پیشرفت مطالعه"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={formatPercent(percent)}
          className="h-1 bg-primary-tint"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </header>

      {/* page stage */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-auto bg-surface-muted py-4"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          const t = e.changedTouches[0];
          touchStart.current = null;
          if (!start || !t || zoom > 1) return;
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          // RTL book: dragging the page to the right brings in the next page from the left
          if (dx > 0) nextPage();
          else prevPage();
        }}
      >
        <h2 className="sr-only">{pageLabel}</h2>
        <div className="w-max min-w-full px-4">
          {cssWidth > 0 && (
            <>
              <PdfPageView
                key={page}
                ref={pageRef}
                doc={doc}
                pageNumber={page}
                cssWidth={cssWidth}
                watermark={session.watermark}
                highlights={pageHighlights}
                activeHighlightId={editor?.mode === "edit" ? editor.highlight.id : null}
                onPageClick={onPageClick}
              />
              {page < total && (
                <PdfPageView
                  key={page + 1}
                  doc={doc}
                  pageNumber={page + 1}
                  cssWidth={cssWidth}
                  watermark={session.watermark}
                  highlights={nextHighlights}
                  hidden
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* bottom bar */}
      <nav aria-label="پیمایش صفحات" className="pb-safe border-t border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-2 py-1.5 sm:px-4">
          <button
            type="button"
            onClick={prevPage}
            disabled={page <= 1}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-2 font-bold text-primary hover:bg-primary-soft disabled:opacity-40"
          >
            <ChevronIcon size={22} className="rotate-180" />
            <span className="hidden sm:inline">صفحه قبل</span>
            <span className="sr-only sm:hidden">صفحه قبل</span>
          </button>

          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = parsePageInput(pageInput);
              if (n !== null) goTo(n);
              else setPageInput(toPersianDigits(page));
            }}
          >
            <label htmlFor={pageInputId} className="sr-only text-sm text-ink-muted sm:not-sr-only">
              رفتن به صفحه
            </label>
            <input
              id={pageInputId}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              enterKeyHint="go"
              autoComplete="off"
              className="h-11 w-16 rounded-control border border-line bg-bg text-center text-base text-ink focus:border-primary focus:bg-surface"
            />
            <button
              type="submit"
              className="hidden min-h-11 min-w-11 items-center sm:inline-flex justify-center rounded-control px-2 text-sm font-bold text-primary hover:bg-primary-soft"
            >
              برو
            </button>
          </form>

          <div className="flex items-center" role="group" aria-label="بزرگ‌نمایی">
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="کوچک‌نمایی"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-primary hover:bg-primary-soft disabled:opacity-40"
            >
              <MinusIcon size={20} />
            </button>
            <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
              {formatPercent(zoom * 100)}
            </span>
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="بزرگ‌نمایی"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-primary hover:bg-primary-soft disabled:opacity-40"
            >
              <PlusIcon size={20} />
            </button>
          </div>

          <button
            type="button"
            onClick={nextPage}
            disabled={page >= total}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-control px-2 font-bold text-primary hover:bg-primary-soft disabled:opacity-40"
          >
            <span className="hidden sm:inline">صفحه بعد</span>
            <span className="sr-only sm:hidden">صفحه بعد</span>
            <ChevronIcon size={22} />
          </button>
        </div>
      </nav>

      {pending && !editor && (
        <SelectionPopover
          anchor={pending.anchor}
          busy={busy}
          onColor={(c) => void create(pending, c)}
          onNote={() => setEditor({ mode: "create", selection: pending })}
        />
      )}

      <HighlightEditor
        open={editor !== null}
        mode={editor?.mode ?? "create"}
        quote={editor ? (editor.mode === "create" ? editor.selection.text : editor.highlight.text) : ""}
        initialColor={editor?.mode === "edit" ? editor.highlight.color : "yellow"}
        initialNote={editor?.mode === "edit" ? editor.highlight.note : ""}
        busy={busy}
        onClose={() => setEditor(null)}
        onSave={(v) => void saveEditor(v)}
        onDelete={editor?.mode === "edit" ? () => void removeHighlight() : undefined}
      />

      <HighlightsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        highlights={highlights}
        currentPage={page}
        onJump={goTo}
        onEdit={(h) => {
          setDrawerOpen(false);
          goTo(h.page);
          setEditor({ mode: "edit", highlight: h });
        }}
      />

      <p
        role="status"
        className={`pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto w-fit max-w-sm rounded-control bg-ink px-4 py-2 text-center text-sm text-surface shadow-raised transition-opacity ${
          notice ? "opacity-100" : "opacity-0"
        }`}
      >
        {notice}
      </p>
    </ReaderShell>
  );
}

/* ---------- pieces ---------- */

function ReaderShell({ theme, children }: { theme: ReaderTheme; children: ReactNode }) {
  return (
    <>
      <div data-reader-theme={theme} className="reader-root fixed inset-0 z-40 flex flex-col bg-surface-muted text-ink">
        {children}
      </div>
      <p className="reader-print-block hidden p-8 text-center text-lg font-bold">چاپ کتاب الکترونیک امکان‌پذیر نیست.</p>
    </>
  );
}

function SelectionPopover({
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
  const y = Math.min(anchor.y + 12, vh - 140);
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

function ReaderMessage({
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
      <div className="flex flex-1 items-center justify-center p-4">
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

function ActionLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
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

function ReaderSkeleton({ slug, theme }: { slug: string; theme: ReaderTheme }) {
  return (
    <ReaderShell theme={theme}>
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2" role="status">
        <span className="sr-only">{`در حال آماده‌سازی کتاب ${slug.replace(/-/g, " ")}…`}</span>
        <Skeleton className="size-11" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 max-w-xs" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[900px]" />
      </div>
      <div className="h-14 border-t border-line bg-surface" />
    </ReaderShell>
  );
}
