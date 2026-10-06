"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { routes } from "@/lib/config";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  PROGRESS_SAVE_DELAY_MS,
  createBookmark,
  createHighlight,
  debounce,
  deleteBookmark,
  deleteHighlight,
  getChapter,
  listBookmarks,
  listHighlights,
  progressPercent,
  recordCopy,
  saveProgress,
  updateHighlight,
  type ReaderError,
  type ReaderResult,
} from "@/lib/reader";
import { applyIdMap, localBookmark, localHighlight, tempId, type QueuedOp, type ReplayOutcome } from "@/lib/offline-queue";
import { readOfflineState } from "@/lib/reader-offline";
import {
  DEFAULT_EPUB_SETTINGS,
  FONT_SIZES,
  LINE_HEIGHTS,
  MARGINS,
  anchorElementId,
  chapterForPage,
  columnCount,
  columnPage,
  defaultReadingMode,
  findNthFolded,
  formatEpubPoint,
  formatEpubRange,
  loadEpubSettings,
  locationStart,
  offsetForPage,
  parseEpubHref,
  pagedGeometry,
  parseEpubLocation,
  saveEpubSettings,
  virtualPage,
  type EpubSettings,
  type ReadingMode,
} from "@/lib/reader-epub";
import type {
  Bookmark,
  CopyRecorded,
  EpubChapter,
  EpubInfo,
  Highlight,
  HighlightColor,
  ReaderSession,
  ReadingProgress,
  SearchResult,
} from "@/lib/types";
import { BookmarkIcon, ChevronIcon, HighlighterIcon, ListIcon, SearchIcon } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { HighlightEditor } from "./HighlightEditor";
import { HighlightsDrawer, type NotesTab } from "./HighlightsDrawer";
import { EpubSearchDrawer, EpubSettingsSheet, EpubTocDrawer } from "./EpubPanels";
import { ReaderNotice, ReaderShell, SelectionPopover, type ReaderFatalError } from "./ReaderChrome";
import {
  chapterFragment,
  columnOfElement,
  columnOfOffset,
  firstOffsetInColumn,
  firstVisibleOffset,
  rangeForOffsets,
  scrollToElement,
  scrollToOffset,
  textOffsetOf,
  unwrapAll,
  watermarkTile,
  wrapOffsets,
  type ColumnFrame,
} from "./epub-dom";
import { useCopyQuota } from "./useCopyQuota";
import { useOfflineBook, type OfflineStart } from "./useOfflineBook";
import { OfflinePanel } from "./OfflinePanel";
import type { ReaderTheme } from "./theme";
// --- retention stream (ه۳/ه۴): active-reading heartbeat, goal and time left ---
import { ReaderStudyBar } from "@/components/study/ReaderStudyBar";
// --- end retention stream ---

/** Where to put the reader once a chapter is on screen. */
type Target =
  | { kind: "start" }
  | { kind: "end" }
  | { kind: "offset"; offset: number }
  | { kind: "anchor"; anchor: string }
  | { kind: "search"; q: string; occurrence: number };

interface PendingSelection {
  text: string;
  chapter: number;
  start: number;
  end: number;
  anchor: { x: number; y: number };
}

type Editor = { mode: "create"; selection: PendingSelection } | { mode: "edit"; highlight: Highlight } | null;

/** Errors that end the reading session (shown full screen by Reader). */
const FATAL: ReaderError["kind"][] = ["auth", "forbidden", "no_ebook", "device_limit"];
/** Signed image URLs live ~5 minutes: cached chapters older than this are fetched again. */
const CHAPTER_CACHE_MS = 4 * 60_000;
/** Paged mode: space above and below the page (px). */
const PAGE_PAD_BLOCK = 20;
const SWIPE_MIN_PX = 50;
/** Paged mode: one page per wheel gesture at most this often (ms). */
const WHEEL_PAGE_MS = 350;
/** Added to a success message when the write waits for the network (Phase 6b offline queue). */
const QUEUED_NOTE = " با وصل شدن اینترنت همگام می‌شود.";

type WriteResult<T> = { ok: true; data: T; queued: boolean } | { ok: false; error: ReaderError };

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function initialTarget(session: ReaderSession, epub: EpubInfo): { chapter: number; target: Target } {
  const loc = parseEpubLocation(session.progress?.location);
  if (loc && epub.chapters[loc.chapter]) return { chapter: loc.chapter, target: { kind: "offset", offset: locationStart(loc) } };
  const page = session.progress?.page;
  if (page && page > 1) {
    const chapter = chapterForPage(epub.chapters, page);
    const meta = epub.chapters[chapter];
    if (meta) return { chapter, target: { kind: "offset", offset: offsetForPage(meta, page) } };
  }
  return { chapter: epub.chapters[0]?.index ?? 0, target: { kind: "start" } };
}

export function EpubReader({
  slug,
  session,
  epub,
  theme,
  onTheme,
  onFatal,
  offlineStart = null,
}: {
  slug: string;
  session: ReaderSession;
  epub: EpubInfo;
  theme: ReaderTheme;
  onTheme: (t: ReaderTheme) => void;
  onFatal: (e: ReaderFatalError) => void;
  /** Phase 6b: the book was opened from the local copy (no network) */
  offlineStart?: OfflineStart | null;
}) {
  const [chapter, setChapter] = useState<EpubChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterError, setChapterError] = useState<ReaderError | null>(null);
  const [offset, setOffset] = useState(0);
  const [settings, setSettingsState] = useState<EpubSettings>(DEFAULT_EPUB_SETTINGS);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<"toc" | "search" | "notes" | "settings" | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>("highlights");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // paged mode: viewport width (default mode), reading box, visible column and column count
  const [vw, setVw] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [col, setCol] = useState(0);
  const [colCount, setColCount] = useState(1);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const colRef = useRef(0);
  const colCountRef = useRef(1);
  const pagedRef = useRef(false);
  const geoRef = useRef({ colWidth: 0, gap: 0, stride: 0, height: 0 });
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastWheel = useRef(0);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(new Map<number, { data: EpubChapter; at: number }>());
  const targetRef = useRef<Target | null>(null);
  const chapterRef = useRef<EpubChapter | null>(null);
  const offsetRef = useRef(0);
  const reqRef = useRef(0);
  const lastSaved = useRef<string | null>(session.progress?.location ?? null);
  const suppressSelection = useRef(false);
  const imgRetried = useRef(new Set<number>());
  const pendingRef = useRef<PendingSelection | null>(null);
  const lastRequest = useRef<{ index: number; target: Target } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  chapterRef.current = chapter;
  offsetRef.current = offset;
  pendingRef.current = pending;

  /* ---------- Phase 6b: offline copy, write queue ---------- */
  const onReplayed = useCallback((out: ReplayOutcome) => {
    if (out.highlights.size) setHighlights((list) => applyIdMap(list, out.highlights));
    if (out.bookmarks.size) setBookmarks((list) => applyIdMap(list, out.bookmarks));
  }, []);
  const off = useOfflineBook({ slug, session, start: offlineStart, onFatal, onReplayed });
  const offRef = useRef(off);
  offRef.current = off;
  const annotationsLoaded = useRef(false);

  /** Online call with the offline queue as fallback (offline mode, or the call failed for lack of network). */
  const write = useCallback(async <T,>(send: () => Promise<ReaderResult<T>>, op: QueuedOp, local: () => T): Promise<WriteResult<T>> => {
    const o = offRef.current;
    if (!o.offlineRef.current) {
      const res = await send();
      if (res.ok) {
        o.noteOnline();
        return { ok: true, data: res.data, queued: false };
      }
      if (res.error.kind !== "network") return res;
    }
    if (await o.queue(op)) return { ok: true, data: local(), queued: true };
    return { ok: false, error: { kind: "network" } };
  }, []);

  const fontPx = FONT_SIZES[settings.fontSize] ?? 18;
  const lineHeight = LINE_HEIGHTS[settings.lineHeight] ?? 1.8;
  const margin = MARGINS[settings.margin] ?? MARGINS[1];
  const rtl = epub.direction !== "ltr";

  // «صفحه‌ای» splits the chapter into CSS columns one screen wide; «پیمایشی» scrolls it
  const mode: ReadingMode = settings.mode ?? defaultReadingMode(vw);
  const paged = mode === "paged" && box.width > 0 && box.height > 0;
  const geo = pagedGeometry(box, { fontPx, maxEm: margin.maxEm, padding: margin.padding, padBlock: PAGE_PAD_BLOCK });
  pagedRef.current = paged;
  geoRef.current = geo;

  const total = epub.total_pages;
  const meta = chapter ? epub.chapters[chapter.index] ?? chapter : null;
  // paged: the column on screen mapped onto the chapter's virtual pages; scroll: the first visible offset
  const page = meta ? (paged ? columnPage(meta, col, colCount) : virtualPage(meta, offset)) : 1;
  const percent = progressPercent(page, total);

  useEffect(() => setSettingsState(loadEpubSettings()), []);

  // reading box size (paged geometry) and viewport width (default mode)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const read = () => {
      setVw(window.innerWidth);
      setBox((b) =>
        b.width === scroller.clientWidth && b.height === scroller.clientHeight
          ? b
          : { width: scroller.clientWidth, height: scroller.clientHeight },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);
  const setSettings = useCallback((s: EpubSettings) => {
    setSettingsState(s);
    saveEpubSettings(s);
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  /* ---------- chapters ---------- */

  const fetchChapter = useCallback(
    async (index: number, { prefetch = false } = {}): Promise<EpubChapter | null> => {
      const o = offRef.current;
      if (o.offlineRef.current) {
        const local = o.chapterFromPackage(index);
        if (local) return local;
        if (!prefetch) setChapterError({ kind: "network" });
        return null;
      }
      const hit = cache.current.get(index);
      if (hit && Date.now() - hit.at < CHAPTER_CACHE_MS) return hit.data;
      const res = await getChapter(slug, index);
      if (res.ok) {
        cache.current.set(index, { data: res.data, at: Date.now() });
        o.noteOnline();
        return res.data;
      }
      // no network: read on from the local copy when this device has one
      if (res.error.kind === "network" && (await o.enterOffline())) {
        const local = o.chapterFromPackage(index);
        if (local) return local;
      }
      if (!prefetch) {
        if (FATAL.includes(res.error.kind)) onFatal(res.error);
        else setChapterError(res.error);
      }
      return null;
    },
    [slug, onFatal],
  );

  /* ---------- paged mode: columns ---------- */

  const frame = useCallback((): ColumnFrame | null => {
    const a = articleRef.current;
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { left: r.left, right: r.right, stride: geoRef.current.stride, rtl };
  }, [rtl]);

  const measure = useCallback(() => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root || !chapterRef.current) return;
    let next: number;
    if (pagedRef.current) {
      const f = frame();
      if (!f) return;
      next = firstOffsetInColumn(root, f);
    } else {
      next = firstVisibleOffset(root, scroller.getBoundingClientRect().top + 4);
    }
    offsetRef.current = next;
    setOffset(next);
  }, [frame]);

  /** Count the chapter's columns (after a chapter, size or typography change). */
  const recount = useCallback(() => {
    const a = articleRef.current;
    if (!a) return 1;
    const { colWidth, gap } = geoRef.current;
    const n = columnCount(a.scrollWidth, colWidth, gap);
    colCountRef.current = n;
    setColCount(n);
    return n;
  }, []);

  /** Show column `c` (clamped): RTL columns run to the left, i.e. negative scrollLeft. */
  const showCol = useCallback(
    (c: number) => {
      const a = articleRef.current;
      if (!a) return;
      const n = colCountRef.current;
      const next = Math.min(n - 1, Math.max(0, Math.round(c)));
      colRef.current = next;
      a.scrollLeft = (rtl ? -1 : 1) * next * geoRef.current.stride;
      setCol(next);
      measure();
    },
    [rtl, measure],
  );

  /** Put the text at `offset` on screen in either mode. */
  const goToOffset = useCallback(
    (off: number, margin = 4) => {
      const scroller = scrollerRef.current;
      const root = rootRef.current;
      if (!scroller || !root) return;
      if (!pagedRef.current) {
        scrollToOffset(scroller, root, off, margin);
        return;
      }
      recount();
      const f = frame();
      if (off <= 0 || !f) return showCol(0);
      showCol(colRef.current + columnOfOffset(root, off, f));
    },
    [recount, frame, showCol],
  );

  const applyTarget = useCallback((target: Target) => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root) return;
    if (pagedRef.current) {
      scroller.scrollTop = 0;
      const n = recount();
      const f = frame();
      switch (target.kind) {
        case "start":
          return showCol(0);
        case "end":
          return showCol(n - 1);
        case "offset":
          return goToOffset(target.offset);
        case "anchor": {
          const el = target.anchor ? root.querySelector(`#${CSS.escape(anchorElementId(target.anchor))}`) : null;
          return showCol(el && f ? colRef.current + columnOfElement(el, f) : 0);
        }
        case "search": {
          const hit = findNthFolded(root.textContent ?? "", target.q, target.occurrence);
          if (!hit) return showCol(0);
          goToOffset(hit.start);
          const sel = window.getSelection();
          if (sel) {
            suppressSelection.current = true;
            sel.removeAllRanges();
            sel.addRange(rangeForOffsets(root, hit.start, hit.end));
          }
          return;
        }
      }
    }
    switch (target.kind) {
      case "start":
        scroller.scrollTop = 0;
        break;
      case "end":
        scroller.scrollTop = scroller.scrollHeight;
        break;
      case "offset":
        scrollToOffset(scroller, root, target.offset);
        break;
      case "anchor": {
        const el = target.anchor ? root.querySelector(`#${CSS.escape(anchorElementId(target.anchor))}`) : null;
        if (el) scrollToElement(scroller, el);
        else scroller.scrollTop = 0;
        break;
      }
      case "search": {
        const hit = findNthFolded(root.textContent ?? "", target.q, target.occurrence);
        if (!hit) {
          scroller.scrollTop = 0;
          break;
        }
        // keep the match a little below the top so its context shows
        scrollToOffset(scroller, root, hit.start, Math.round(scroller.clientHeight / 3));
        const sel = window.getSelection();
        if (sel) {
          suppressSelection.current = true;
          sel.removeAllRanges();
          sel.addRange(rangeForOffsets(root, hit.start, hit.end));
        }
        break;
      }
    }
  }, [recount, frame, showCol, goToOffset]);

  const openChapter = useCallback(
    async (index: number, target: Target) => {
      if (!epub.chapters[index]) return;
      lastRequest.current = { index, target };
      setPending(null);
      setChapterError(null);
      window.getSelection()?.removeAllRanges();
      if (chapterRef.current?.index === index) {
        applyTarget(target);
        return;
      }
      const id = ++reqRef.current;
      setLoading(true);
      const data = await fetchChapter(index);
      if (id !== reqRef.current) return;
      setLoading(false);
      if (!data) return;
      targetRef.current = target;
      setChapter(data);
    },
    [epub.chapters, fetchChapter, applyTarget],
  );

  // first chapter: restore the saved position
  useEffect(() => {
    const { chapter: c, target } = initialTarget(session, epub);
    void openChapter(c, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- annotations ---------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!offRef.current.offlineRef.current) {
        // send writes queued offline first, so the lists below include them
        await offRef.current.flush().catch(() => null);
        const [hl, bm] = await Promise.all([listHighlights(slug), listBookmarks(slug)]);
        if (cancelled) return;
        if (hl.ok) setHighlights(hl.data);
        if (bm.ok) setBookmarks(bm.data);
        const networkDown = (!hl.ok && hl.error.kind === "network") || (!bm.ok && bm.error.kind === "network");
        if (!networkDown) {
          annotationsLoaded.current = hl.ok && bm.ok;
          return;
        }
      }
      // offline: the last known lists of this device's copy (with the changes made offline)
      const state = offlineStart?.state ?? (await readOfflineState(slug));
      if (cancelled) return;
      if (state) {
        setHighlights(state.highlights);
        setBookmarks(state.bookmarks);
      }
      annotationsLoaded.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // keep the local snapshot current (used to open the book offline later)
  useEffect(() => {
    if (annotationsLoaded.current) offRef.current.updateState({ highlights, bookmarks });
  }, [highlights, bookmarks]);
  useEffect(() => {
    if (!offlineStart && session.progress) offRef.current.updateState({ progress: session.progress });
  }, [offlineStart, session.progress]);

  // tell the reader when the copy on this device takes over (and when the network is back)
  const wasOffline = useRef(off.offline);
  useEffect(() => {
    if (wasOffline.current === off.offline) return;
    wasOffline.current = off.offline;
    flash(off.offline ? "اینترنت قطع است؛ ادامه کتاب از نسخه آفلاین این دستگاه خوانده می‌شود." : "دوباره به اینترنت وصل شدید.");
  }, [off.offline, flash]);

  const activeId = editor?.mode === "edit" ? editor.highlight.id : null;
  const chapterMarks = useMemo(() => {
    if (!chapter) return [];
    return highlights
      .map((h) => ({ h, loc: parseEpubLocation(h.location) }))
      .filter((x) => x.loc?.kind === "range" && x.loc.chapter === chapter.index)
      .map(({ h, loc }) => ({ h, start: loc!.kind === "range" ? loc!.start : 0, end: loc!.kind === "range" ? loc!.end : 0 }))
      .sort((a, b) => a.start - b.start);
  }, [highlights, chapter]);

  /* ---------- render a chapter (inert parse + defensive pass; html only ever comes from getChapter) ---------- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !chapter) return;
    root.replaceChildren(chapterFragment(chapter.html));
    // paged: off-screen columns are clipped, so lazy images would load (and reflow) only when shown
    if (pagedRef.current) root.querySelectorAll("img").forEach((img) => img.setAttribute("loading", "eager"));
    const target = targetRef.current ?? { kind: "start" };
    targetRef.current = null;
    applyTarget(target);
    measure();
    // prefetch the next chapter
    if (chapter.next !== null) void fetchChapter(chapter.next, { prefetch: true });
  }, [chapter, applyTarget, measure, fetchChapter]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !chapter) return;
    unwrapAll(root, "mark[data-hl]");
    for (const { h, start, end } of chapterMarks) {
      wrapOffsets(root, start, end, () => {
        const m = document.createElement("mark");
        m.dataset.hl = String(h.id);
        m.className = `reader-mark reader-mark-${h.color}${h.id === activeId ? " reader-mark-active" : ""}`;
        return m;
      });
    }
  }, [chapter, chapterMarks, activeId]);

  // typography, mode and size changes reflow the text: keep the first visible offset on screen
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroller = scrollerRef.current;
    const article = articleRef.current;
    if (!root || !scroller || !chapterRef.current) return;
    if (!paged && article) article.scrollLeft = 0;
    if (paged) scroller.scrollTop = 0;
    goToOffset(offsetRef.current);
  }, [settings, paged, geo.colWidth, geo.gap, geo.height, goToOffset]);

  // paged: late images and web fonts change the column count — recount and stay at the same text
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !paged) return;
    let raf = 0;
    const relayout = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (pagedRef.current && chapterRef.current) goToOffset(offsetRef.current);
      });
    };
    root.addEventListener("load", relayout, true);
    void document.fonts?.ready.then(relayout);
    return () => {
      root.removeEventListener("load", relayout, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [paged, goToOffset]);

  // a signed image URL expired: fetch the chapter once more and stay in place
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onError = (e: Event) => {
      const c = chapterRef.current;
      if (!(e.target instanceof HTMLImageElement) || !c || imgRetried.current.has(c.index)) return;
      if (offRef.current.offlineRef.current) return; // package images are inline
      imgRetried.current.add(c.index);
      cache.current.delete(c.index);
      void getChapter(slug, c.index).then((res) => {
        if (!res.ok || chapterRef.current?.index !== c.index) return;
        cache.current.set(c.index, { data: res.data, at: Date.now() });
        targetRef.current = { kind: "offset", offset: offsetRef.current };
        setChapter(res.data);
      });
    };
    root.addEventListener("error", onError, true);
    return () => root.removeEventListener("error", onError, true);
  }, [slug]);

  /* ---------- progress ---------- */
  /** PUT progress, or queue it offline; the local snapshot follows either way. */
  const persistProgress = useCallback(
    (body: { page: number; total_pages: number; location: string }, keepalive = false) => {
      const local: ReadingProgress = {
        ...body,
        percent: progressPercent(body.page, body.total_pages),
        updated_at: new Date().toISOString(),
      };
      offRef.current.updateState({ progress: local });
      void write(() => saveProgress(slug, body, { keepalive }), { kind: "progress", body }, () => local);
    },
    [slug, write],
  );
  const saver = useMemo(
    () =>
      debounce((p: number, t: number, location: string) => {
        lastSaved.current = location;
        persistProgress({ page: p, total_pages: t, location });
      }, PROGRESS_SAVE_DELAY_MS),
    [persistProgress],
  );

  const location = chapter ? formatEpubPoint(chapter.index, offset) : null;
  useEffect(() => {
    if (!location || loading || location === lastSaved.current) return;
    saver(page, total, location);
  }, [location, page, total, saver, loading]);

  const progressNow = useRef({ page, total, location });
  progressNow.current = { page, total, location };
  useEffect(() => {
    const flushNow = () => {
      saver.cancel();
      const { page: p, total: t, location: loc } = progressNow.current;
      if (loc && t > 0 && loc !== lastSaved.current) {
        lastSaved.current = loc;
        persistProgress({ page: p, total_pages: t, location: loc }, true);
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
  }, [saver, persistProgress]);

  const scrollRaf = useRef(0);
  const onScroll = useCallback(() => {
    if (pagedRef.current) {
      // the page box never scrolls vertically in paged mode (e.g. focus moved into it)
      if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      return;
    }
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      measure();
    });
  }, [measure]);

  /* ---------- paging ---------- */
  const forward = useCallback(() => {
    const s = scrollerRef.current;
    const c = chapterRef.current;
    if (!s || !c) return;
    if (pagedRef.current) {
      if (colRef.current < colCountRef.current - 1) return showCol(colRef.current + 1);
      if (c.next !== null) void openChapter(c.next, { kind: "start" });
      return;
    }
    if (s.scrollTop + s.clientHeight >= s.scrollHeight - 4) {
      if (c.next !== null) void openChapter(c.next, { kind: "start" });
      return;
    }
    s.scrollBy({ top: s.clientHeight - fontPx * lineHeight });
  }, [openChapter, fontPx, lineHeight, showCol]);

  const back = useCallback(() => {
    const s = scrollerRef.current;
    const c = chapterRef.current;
    if (!s || !c) return;
    if (pagedRef.current) {
      if (colRef.current > 0) return showCol(colRef.current - 1);
      if (c.prev !== null) void openChapter(c.prev, { kind: "end" });
      return;
    }
    if (s.scrollTop <= 4) {
      if (c.prev !== null) void openChapter(c.prev, { kind: "end" });
      return;
    }
    s.scrollBy({ top: -(s.clientHeight - fontPx * lineHeight) });
  }, [openChapter, fontPx, lineHeight, showCol]);

  /** Paged: the browser scrolled the column box itself (focus, drag-selecting past the edge). */
  const onArticleScroll = useCallback(() => {
    const a = articleRef.current;
    const stride = geoRef.current.stride;
    if (!a || !pagedRef.current || !(stride > 0)) return;
    const c = Math.round(Math.abs(a.scrollLeft) / stride);
    if (c !== colRef.current) {
      colRef.current = c;
      setCol(c);
      measure();
    }
    // settle on a whole page once the user is not selecting
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (Math.abs(Math.abs(a.scrollLeft) - colRef.current * stride) > 1) showCol(colRef.current);
    }, 160);
  }, [measure, showCol]);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!pagedRef.current || Math.abs(e.deltaY) < 4 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const now = Date.now();
      if (now - lastWheel.current < WHEEL_PAGE_MS) return;
      lastWheel.current = now;
      if (e.deltaY > 0) forward();
      else back();
    },
    [forward, back],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // deterrent only: the book is never offered for saving/printing
      if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      // RTL book: forward is to the left (mirrored for LTR books)
      const fwdArrow = rtl ? "ArrowLeft" : "ArrowRight";
      const backArrow = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwdArrow || e.key === "PageDown" || (pagedRef.current && (e.key === "ArrowDown" || e.key === " "))) {
        e.preventDefault();
        forward();
      } else if (e.key === backArrow || e.key === "PageUp" || (pagedRef.current && e.key === "ArrowUp")) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forward, back, rtl]);

  /* ---------- selection → highlight popover ---------- */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      if (suppressSelection.current) {
        suppressSelection.current = false;
        return setPending(null);
      }
      const sel = window.getSelection();
      const root = rootRef.current;
      const c = chapterRef.current;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root || !c) return setPending(null);
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setPending(null);
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (!text) return setPending(null);
      const start = textOffsetOf(root, range.startContainer, range.startOffset);
      const end = textOffsetOf(root, range.endContainer, range.endOffset);
      if (start < 0 || end <= start) return setPending(null);
      const b = range.getBoundingClientRect();
      setPending({ text, chapter: c.index, start, end, anchor: { x: b.left + b.width / 2, y: b.bottom } });
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
  }, []);

  const create = useCallback(
    async (sel: PendingSelection, color: HighlightColor, note = "") => {
      const m = epub.chapters[sel.chapter];
      if (!m) return false;
      setBusy(true);
      const body = {
        page: virtualPage(m, sel.start),
        text: sel.text,
        rects: [],
        color,
        note,
        location: formatEpubRange(sel.chapter, sel.start, sel.end),
      };
      const temp = tempId();
      const res = await write(
        () => createHighlight(slug, body),
        { kind: "highlight-create", tempId: temp, body },
        () => localHighlight(temp, body, new Date().toISOString()),
      );
      setBusy(false);
      if (!res.ok) {
        flash(res.error.kind === "throttled" ? "کمی صبر کنید و دوباره تلاش کنید." : "ذخیره هایلایت انجام نشد. دوباره تلاش کنید.");
        return false;
      }
      setHighlights((list) => [...list, res.data]);
      setPending(null);
      window.getSelection()?.removeAllRanges();
      flash(res.queued ? `هایلایت ذخیره شد؛${QUEUED_NOTE}` : "هایلایت ذخیره شد.");
      return true;
    },
    [epub.chapters, slug, flash, write],
  );

  const saveEditor = useCallback(
    async ({ color, note }: { color: HighlightColor; note: string }) => {
      if (!editor) return;
      if (editor.mode === "create") {
        if (await create(editor.selection, color, note)) setEditor(null);
        return;
      }
      setBusy(true);
      const current = editor.highlight;
      const res = await write(
        () => updateHighlight(slug, current.id, { color, note }),
        { kind: "highlight-update", id: current.id, body: { color, note } },
        () => ({ ...current, color, note, updated_at: new Date().toISOString() }),
      );
      setBusy(false);
      if (!res.ok) return flash("ذخیره تغییرات انجام نشد. دوباره تلاش کنید.");
      setHighlights((list) => list.map((h) => (h.id === res.data.id ? res.data : h)));
      setEditor(null);
      if (res.queued) flash(`تغییرات ذخیره شد؛${QUEUED_NOTE}`);
    },
    [editor, create, slug, flash, write],
  );

  const removeHighlight = useCallback(async () => {
    if (editor?.mode !== "edit") return;
    setBusy(true);
    const id = editor.highlight.id;
    const res = await write(() => deleteHighlight(slug, id), { kind: "highlight-delete", id }, () => undefined);
    setBusy(false);
    if (!res.ok) return flash("حذف هایلایت انجام نشد. دوباره تلاش کنید.");
    setHighlights((list) => list.filter((h) => h.id !== id));
    setEditor(null);
    flash(res.queued ? `هایلایت حذف شد؛${QUEUED_NOTE}` : "هایلایت حذف شد.");
  }, [editor, slug, flash, write]);

  /* ---------- bookmarks ---------- */
  const currentBookmark = bookmarks.find((b) => b.page === page) ?? null;
  const toggleBookmark = useCallback(async () => {
    if (!chapter) return;
    setBusy(true);
    if (currentBookmark) {
      const id = currentBookmark.id;
      const res = await write(() => deleteBookmark(slug, id), { kind: "bookmark-delete", id }, () => undefined);
      setBusy(false);
      if (!res.ok) return flash("حذف نشانک انجام نشد. دوباره تلاش کنید.");
      setBookmarks((list) => list.filter((b) => b.id !== id));
      return flash(res.queued ? `نشانک برداشته شد؛${QUEUED_NOTE}` : "نشانک برداشته شد.");
    }
    const body = { page, location: formatEpubPoint(chapter.index, offset), label: chapter.title.slice(0, 120) };
    const temp = tempId();
    const res = await write(
      () => createBookmark(slug, body),
      { kind: "bookmark-create", tempId: temp, body },
      () => localBookmark(temp, body, new Date().toISOString()),
    );
    setBusy(false);
    if (!res.ok) return flash("افزودن نشانک انجام نشد. دوباره تلاش کنید.");
    setBookmarks((list) => [...list.filter((b) => b.id !== res.data.id), res.data]);
    flash(res.queued ? `این صفحه نشانک‌گذاری شد؛${QUEUED_NOTE}` : "این صفحه نشانک‌گذاری شد.");
  }, [chapter, currentBookmark, slug, page, offset, flash, write]);

  const removeBookmark = useCallback(
    async (b: Bookmark) => {
      const res = await write(() => deleteBookmark(slug, b.id), { kind: "bookmark-delete", id: b.id }, () => undefined);
      if (!res.ok) return flash("حذف نشانک انجام نشد. دوباره تلاش کنید.");
      setBookmarks((list) => list.filter((x) => x.id !== b.id));
    },
    [slug, flash, write],
  );

  const jumpToLocation = useCallback(
    (loc: string, fallbackPage: number) => {
      const parsed = parseEpubLocation(loc);
      if (parsed) return void openChapter(parsed.chapter, { kind: "offset", offset: locationStart(parsed) });
      const c = chapterForPage(epub.chapters, fallbackPage);
      const m = epub.chapters[c];
      if (m) void openChapter(c, { kind: "offset", offset: offsetForPage(m, fallbackPage) });
    },
    [epub.chapters, openChapter],
  );

  /* ---------- taps, links, copy ---------- */
  const onTextClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element;
      const root = rootRef.current;
      const link = target.closest("a");
      if (link && root?.contains(link)) {
        const href = link.getAttribute("href");
        const internal = parseEpubHref(href);
        if (internal) {
          e.preventDefault();
          void openChapter(internal.chapter, { kind: "anchor", anchor: internal.anchor });
          return;
        }
        if (!href) e.preventDefault();
        return; // external http(s): opens in a new tab
      }
      if (target.closest("button, a, input")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (pendingRef.current) return setPending(null);
      const mark = target.closest("mark[data-hl]");
      if (mark instanceof HTMLElement) {
        const h = highlights.find((x) => String(x.id) === mark.dataset.hl);
        if (h) return setEditor({ mode: "edit", highlight: h });
      }
      const box = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - box.left;
      // physical thirds: RTL book, so the left third goes forward (mirrored for LTR books)
      const third = x < box.width / 3 ? "left" : x > (box.width * 2) / 3 ? "right" : "middle";
      if (third === "middle") setChrome((v) => !v);
      else if ((third === "left") === rtl) forward();
      else back();
    },
    [openChapter, highlights, forward, back, rtl],
  );

  // offline: the report waits in the queue (the optimistic count stays until the server answers)
  const recordCopyOrQueue = useCallback(
    async (s: string, chars: number): Promise<ReaderResult<CopyRecorded>> => {
      const res = await write(() => recordCopy(s, chars), { kind: "copy", chars }, () => ({ limit: 0, used: 0, granted: 0 }));
      return res.ok && !res.queued ? { ok: true, data: res.data } : { ok: false, error: { kind: "network" } };
    },
    [write],
  );
  const { quota: copyQuota, copyText } = useCopyQuota(slug, session, flash, recordCopyOrQueue);
  useEffect(() => {
    if (copyQuota) offRef.current.updateState({ copy_quota: copyQuota });
  }, [copyQuota]);
  const onCopy = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const out = copyText(window.getSelection()?.toString() ?? "");
      if (out === null) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", out);
    },
    [copyText],
  );

  const onSearchOpen = useCallback(
    (r: SearchResult, q: string) => void openChapter(r.chapter, { kind: "search", q, occurrence: r.occurrence }),
    [openChapter],
  );

  /* ---------- render ---------- */
  const productHref = routes.product(slug);
  const pageLabel = `صفحه ${formatNumber(page)} از ${formatNumber(total)}`;
  const watermarkFill = theme === "dark" ? "rgba(230,232,238,0.075)" : "rgba(16,24,43,0.075)";
  const iconBtn =
    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-primary hover:bg-primary-soft disabled:opacity-40";
  const nextMeta = chapter?.next != null ? epub.chapters[chapter.next] : null;

  return (
    <ReaderShell theme={theme}>
      {chrome && (
        <header className="relative border-b border-line bg-surface">
          <div className="flex items-center gap-0.5 px-1 py-1 sm:gap-1 sm:px-3">
            <Link href={productHref} className={iconBtn} aria-label="بازگشت به صفحه کتاب">
              <ChevronIcon size={22} className="rotate-180" />
            </Link>
            <div className="min-w-0 flex-1 px-1">
              <h1 className="truncate text-sm font-bold sm:text-base">{session.book.title}</h1>
              <p className="truncate text-xs text-ink-muted">{pageLabel}</p>
            </div>
            <button type="button" className={iconBtn} aria-label="فهرست مطالب" onClick={() => setPanel("toc")}>
              <ListIcon size={22} />
            </button>
            <button type="button" className={iconBtn} aria-label="جست‌وجو در کتاب" onClick={() => setPanel("search")}>
              <SearchIcon size={22} />
            </button>
            <button
              type="button"
              className={iconBtn}
              aria-label={currentBookmark ? "برداشتن نشانک این صفحه" : "نشانک‌گذاری این صفحه"}
              aria-pressed={currentBookmark !== null}
              disabled={busy || !chapter}
              onClick={() => void toggleBookmark()}
            >
              <BookmarkIcon size={22} filled={currentBookmark !== null} />
            </button>
            <button
              type="button"
              className={iconBtn}
              aria-label="هایلایت‌ها و نشانک‌ها"
              onClick={() => {
                setNotesTab("highlights");
                setPanel("notes");
              }}
            >
              <HighlighterIcon size={22} />
            </button>
            <button type="button" className={`${iconBtn} text-base font-black`} aria-label="تنظیمات نمایش" onClick={() => setPanel("settings")}>
              <span aria-hidden="true" dir="ltr">
                Aa
              </span>
            </button>
          </div>
          <div
            role="progressbar"
            aria-label="پیشرفت مطالعه"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={`${pageLabel}، ${formatPercent(percent)}`}
            className="h-1 bg-primary-tint"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </header>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          onClick={onTextClick}
          onWheel={onWheel}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touchStart.current = paged && e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const t = e.changedTouches[0];
            touchStart.current = null;
            if (!start || !t || !pagedRef.current) return;
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) return;
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            // RTL book (as in the PDF reader): dragging the page to the right brings in the next page from the left
            if ((dx > 0) === rtl) forward();
            else back();
          }}
          className={`absolute inset-0 overscroll-contain bg-surface ${paged ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <article
            ref={articleRef}
            lang={epub.language || "fa"}
            dir={epub.direction}
            onScroll={paged ? onArticleScroll : undefined}
            className={`epub-content mx-auto ${paged ? "epub-paged overflow-hidden" : "py-6"} ${settings.justify ? "epub-justify" : ""}`}
            style={
              paged
                ? ({
                    fontSize: `${fontPx}px`,
                    lineHeight,
                    width: `${geo.colWidth}px`,
                    height: `${geo.height}px`,
                    marginBlock: `${PAGE_PAD_BLOCK}px`,
                    columnWidth: `${geo.colWidth}px`,
                    columnGap: `${geo.gap}px`,
                    columnFill: "auto",
                    "--epub-page-h": `${geo.height}px`,
                  } as React.CSSProperties)
                : { fontSize: `${fontPx}px`, lineHeight, maxWidth: `${margin.maxEm}em`, paddingInline: `${margin.padding}px` }
            }
          >
            <h2 className="sr-only">{chapter?.title ?? "در حال بارگذاری فصل"}</h2>
            <div
              ref={rootRef}
              onCopy={onCopy}
              onCut={onCopy}
              onContextMenu={(e) => {
                if (e.target instanceof HTMLImageElement) e.preventDefault();
              }}
              onDragStart={(e) => {
                if (e.target instanceof HTMLImageElement) e.preventDefault();
              }}
            />
            {chapter && !loading && (
              <div className="mt-10 border-t border-line pt-6 text-center [break-inside:avoid]">
                {nextMeta ? (
                  <button
                    type="button"
                    onClick={() => void openChapter(nextMeta.index, { kind: "start" })}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 text-base font-bold text-surface hover:bg-primary-hover"
                  >
                    فصل بعد
                    <ChevronIcon size={20} />
                    <span className="sr-only">{`: ${nextMeta.title}`}</span>
                  </button>
                ) : (
                  <p className="text-sm font-bold text-ink-muted">پایان کتاب</p>
                )}
              </div>
            )}
          </article>
        </div>

        {/* watermark: faint, tiled, never selectable or clickable */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none"
          style={{ backgroundImage: watermarkTile(session.watermark, watermarkFill), backgroundRepeat: "repeat" }}
        />

        {loading && (
          <div className="absolute inset-0 overflow-hidden bg-surface p-6" role="status">
            <span className="sr-only">در حال بارگذاری فصل…</span>
            <div className="mx-auto max-w-[34em] space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        )}

        {chapterError && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface p-4">
            <div className="max-w-sm text-center">
              <p className="mb-4 font-bold leading-8">
                {chapterError.kind === "throttled" ? "کمی صبر کنید و دوباره تلاش کنید." : "بارگذاری این فصل ممکن نشد."}
              </p>
              <button
                type="button"
                onClick={() => {
                  const last = lastRequest.current;
                  if (last) void openChapter(last.index, last.target);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-surface hover:bg-primary-hover"
              >
                تلاش دوباره
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- retention stream: heartbeat always runs; the strip shows with the chrome --- */}
      <div className={chrome ? "border-t border-line bg-surface" : ""}>
        <ReaderStudyBar
          slug={slug}
          page={page}
          totalPages={total}
          chapterEnd={meta ? meta.start_page + meta.pages - 1 : null}
          visible={chrome}
          className="mx-auto max-w-3xl px-3"
        />
      </div>
      {/* --- end retention stream --- */}
      {chrome && (
        <footer className="pb-safe border-t border-line bg-surface">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2 text-xs">
            {off.offline && (
              <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">حالت آفلاین</span>
            )}
            <span className="min-w-0 flex-1 truncate font-bold">{chapter?.title ?? ""}</span>
            {paged && chapter && (
              <span className="shrink-0 tabular-nums text-ink-muted">{`صفحه ${formatNumber(col + 1)} از ${formatNumber(colCount)} این فصل`}</span>
            )}
            <span className="shrink-0 tabular-nums text-ink-muted">{formatPercent(percent)}</span>
          </div>
        </footer>
      )}

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

      <EpubTocDrawer
        open={panel === "toc"}
        onClose={() => setPanel(null)}
        toc={epub.toc}
        currentChapter={chapter?.index ?? -1}
        onOpen={(t) => void openChapter(t.chapter, { kind: "anchor", anchor: t.anchor })}
      />
      <EpubSearchDrawer
        open={panel === "search"}
        onClose={() => setPanel(null)}
        slug={slug}
        onOpen={onSearchOpen}
        search={off.search}
      />
      <HighlightsDrawer
        open={panel === "notes"}
        onClose={() => setPanel(null)}
        highlights={highlights}
        bookmarks={bookmarks}
        currentPage={page}
        initialTab={notesTab}
        onJump={(h) => jumpToLocation(h.location, h.page)}
        onEdit={(h) => {
          setPanel(null);
          jumpToLocation(h.location, h.page);
          setEditor({ mode: "edit", highlight: h });
        }}
        onJumpBookmark={(b) => jumpToLocation(b.location, b.page)}
        onDeleteBookmark={(b) => void removeBookmark(b)}
        slug={slug}
        copyQuota={copyQuota}
      />
      <EpubSettingsSheet
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        settings={settings}
        mode={mode}
        copyQuota={copyQuota}
        onChange={setSettings}
        theme={theme}
        onTheme={onTheme}
      >
        {session.offline && <OfflinePanel off={off} info={session.offline} />}
      </EpubSettingsSheet>

      <ReaderNotice text={notice} />
    </ReaderShell>
  );
}
