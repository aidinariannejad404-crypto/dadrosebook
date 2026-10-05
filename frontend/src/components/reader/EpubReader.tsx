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
  saveProgress,
  updateHighlight,
  type ReaderError,
} from "@/lib/reader";
import {
  DEFAULT_EPUB_SETTINGS,
  FONT_SIZES,
  LINE_HEIGHTS,
  MARGINS,
  anchorElementId,
  buildCopyText,
  chapterForPage,
  findNthFolded,
  formatEpubPoint,
  formatEpubRange,
  loadEpubSettings,
  locationStart,
  offsetForPage,
  parseEpubHref,
  parseEpubLocation,
  saveEpubSettings,
  virtualPage,
  type EpubSettings,
} from "@/lib/reader-epub";
import type { Bookmark, EpubChapter, EpubInfo, Highlight, HighlightColor, ReaderSession, SearchResult } from "@/lib/types";
import { BookmarkIcon, ChevronIcon, HighlighterIcon, ListIcon, SearchIcon } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { HighlightEditor } from "./HighlightEditor";
import { HighlightsDrawer, type NotesTab } from "./HighlightsDrawer";
import { EpubSearchDrawer, EpubSettingsSheet, EpubTocDrawer } from "./EpubPanels";
import { ReaderNotice, ReaderShell, SelectionPopover, type ReaderFatalError } from "./ReaderChrome";
import {
  chapterFragment,
  firstVisibleOffset,
  rangeForOffsets,
  scrollToElement,
  scrollToOffset,
  textOffsetOf,
  unwrapAll,
  watermarkTile,
  wrapOffsets,
} from "./epub-dom";
import type { ReaderTheme } from "./theme";

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
}: {
  slug: string;
  session: ReaderSession;
  epub: EpubInfo;
  theme: ReaderTheme;
  onTheme: (t: ReaderTheme) => void;
  onFatal: (e: ReaderFatalError) => void;
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

  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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

  const total = epub.total_pages;
  const meta = chapter ? epub.chapters[chapter.index] ?? chapter : null;
  const page = meta ? virtualPage(meta, offset) : 1;
  const percent = progressPercent(page, total);

  const fontPx = FONT_SIZES[settings.fontSize] ?? 18;
  const lineHeight = LINE_HEIGHTS[settings.lineHeight] ?? 1.8;
  const margin = MARGINS[settings.margin] ?? MARGINS[1];

  useEffect(() => setSettingsState(loadEpubSettings()), []);
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
      const hit = cache.current.get(index);
      if (hit && Date.now() - hit.at < CHAPTER_CACHE_MS) return hit.data;
      const res = await getChapter(slug, index);
      if (res.ok) {
        cache.current.set(index, { data: res.data, at: Date.now() });
        return res.data;
      }
      if (!prefetch) {
        if (FATAL.includes(res.error.kind)) onFatal(res.error);
        else setChapterError(res.error);
      }
      return null;
    },
    [slug, onFatal],
  );

  const applyTarget = useCallback((target: Target) => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root) return;
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
  }, []);

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
    void Promise.all([listHighlights(slug), listBookmarks(slug)]).then(([hl, bm]) => {
      if (cancelled) return;
      if (hl.ok) setHighlights(hl.data);
      if (bm.ok) setBookmarks(bm.data);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const activeId = editor?.mode === "edit" ? editor.highlight.id : null;
  const chapterMarks = useMemo(() => {
    if (!chapter) return [];
    return highlights
      .map((h) => ({ h, loc: parseEpubLocation(h.location) }))
      .filter((x) => x.loc?.kind === "range" && x.loc.chapter === chapter.index)
      .map(({ h, loc }) => ({ h, start: loc!.kind === "range" ? loc!.start : 0, end: loc!.kind === "range" ? loc!.end : 0 }))
      .sort((a, b) => a.start - b.start);
  }, [highlights, chapter]);

  const measure = useCallback(() => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!scroller || !root || !chapterRef.current) return;
    const top = scroller.getBoundingClientRect().top + 4;
    setOffset(firstVisibleOffset(root, top));
  }, []);

  /* ---------- render a chapter (inert parse + defensive pass; html only ever comes from getChapter) ---------- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !chapter) return;
    root.replaceChildren(chapterFragment(chapter.html));
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

  // typography changes reflow the text: keep the first visible offset on screen
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroller = scrollerRef.current;
    if (!root || !scroller || !chapterRef.current) return;
    scrollToOffset(scroller, root, offsetRef.current, 4);
  }, [settings]);

  // a signed image URL expired: fetch the chapter once more and stay in place
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onError = (e: Event) => {
      const c = chapterRef.current;
      if (!(e.target instanceof HTMLImageElement) || !c || imgRetried.current.has(c.index)) return;
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
  const saver = useMemo(
    () =>
      debounce((p: number, t: number, location: string) => {
        lastSaved.current = location;
        void saveProgress(slug, { page: p, total_pages: t, location });
      }, PROGRESS_SAVE_DELAY_MS),
    [slug],
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
        void saveProgress(slug, { page: p, total_pages: t, location: loc }, { keepalive: true });
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

  const scrollRaf = useRef(0);
  const onScroll = useCallback(() => {
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
    if (s.scrollTop + s.clientHeight >= s.scrollHeight - 4) {
      if (c.next !== null) void openChapter(c.next, { kind: "start" });
      return;
    }
    s.scrollBy({ top: s.clientHeight - fontPx * lineHeight });
  }, [openChapter, fontPx, lineHeight]);

  const back = useCallback(() => {
    const s = scrollerRef.current;
    const c = chapterRef.current;
    if (!s || !c) return;
    if (s.scrollTop <= 4) {
      if (c.prev !== null) void openChapter(c.prev, { kind: "end" });
      return;
    }
    s.scrollBy({ top: -(s.clientHeight - fontPx * lineHeight) });
  }, [openChapter, fontPx, lineHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // deterrent only: the book is never offered for saving/printing
      if ((e.ctrlKey || e.metaKey) && ["p", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      // RTL book: forward is to the left
      if (e.key === "ArrowLeft" || e.key === "PageDown") {
        e.preventDefault();
        forward();
      } else if (e.key === "ArrowRight" || e.key === "PageUp") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forward, back]);

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
      const res = await createHighlight(slug, {
        page: virtualPage(m, sel.start),
        text: sel.text,
        rects: [],
        color,
        note,
        location: formatEpubRange(sel.chapter, sel.start, sel.end),
      });
      setBusy(false);
      if (!res.ok) {
        flash(res.error.kind === "throttled" ? "کمی صبر کنید و دوباره تلاش کنید." : "ذخیره هایلایت انجام نشد. دوباره تلاش کنید.");
        return false;
      }
      setHighlights((list) => [...list, res.data]);
      setPending(null);
      window.getSelection()?.removeAllRanges();
      flash("هایلایت ذخیره شد.");
      return true;
    },
    [epub.chapters, slug, flash],
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

  /* ---------- bookmarks ---------- */
  const currentBookmark = bookmarks.find((b) => b.page === page) ?? null;
  const toggleBookmark = useCallback(async () => {
    if (!chapter) return;
    setBusy(true);
    if (currentBookmark) {
      const res = await deleteBookmark(slug, currentBookmark.id);
      setBusy(false);
      if (!res.ok) return flash("حذف نشانک انجام نشد. دوباره تلاش کنید.");
      setBookmarks((list) => list.filter((b) => b.id !== currentBookmark.id));
      return flash("نشانک برداشته شد.");
    }
    const res = await createBookmark(slug, { page, location: formatEpubPoint(chapter.index, offset), label: chapter.title });
    setBusy(false);
    if (!res.ok) return flash("افزودن نشانک انجام نشد. دوباره تلاش کنید.");
    setBookmarks((list) => [...list.filter((b) => b.id !== res.data.id), res.data]);
    flash("این صفحه نشانک‌گذاری شد.");
  }, [chapter, currentBookmark, slug, page, offset, flash]);

  const removeBookmark = useCallback(
    async (b: Bookmark) => {
      const res = await deleteBookmark(slug, b.id);
      if (!res.ok) return flash("حذف نشانک انجام نشد. دوباره تلاش کنید.");
      setBookmarks((list) => list.filter((x) => x.id !== b.id));
    },
    [slug, flash],
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
      // physical thirds: RTL book, so the left third goes forward
      if (x < box.width / 3) forward();
      else if (x > (box.width * 2) / 3) back();
      else setChrome((v) => !v);
    },
    [openChapter, highlights, forward, back],
  );

  const onCopy = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const text = window.getSelection()?.toString() ?? "";
      if (!text) return;
      e.preventDefault();
      const out = buildCopyText(text, session.copy_limit, session.book);
      e.clipboardData.setData("text/plain", out.text);
      flash(
        out.truncated
          ? `فقط ${formatNumber(session.copy_limit)} نویسه نخست، همراه با ذکر منبع، کپی شد.`
          : "متن همراه با ذکر منبع کپی شد.",
      );
    },
    [session.copy_limit, session.book, flash],
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
          className="absolute inset-0 overflow-y-auto overscroll-contain bg-surface"
        >
          <article
            lang={epub.language || "fa"}
            dir={epub.direction}
            className={`epub-content mx-auto py-6 ${settings.justify ? "epub-justify" : ""}`}
            style={{ fontSize: `${fontPx}px`, lineHeight, maxWidth: `${margin.maxEm}em`, paddingInline: `${margin.padding}px` }}
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
              <div className="mt-10 border-t border-line pt-6 text-center">
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

      {chrome && (
        <footer className="pb-safe border-t border-line bg-surface">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-bold">{chapter?.title ?? ""}</span>
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
      <EpubSearchDrawer open={panel === "search"} onClose={() => setPanel(null)} slug={slug} onOpen={onSearchOpen} />
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
      />
      <EpubSettingsSheet
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        settings={settings}
        onChange={setSettings}
        theme={theme}
        onTheme={onTheme}
      />

      <ReaderNotice text={notice} />
    </ReaderShell>
  );
}
