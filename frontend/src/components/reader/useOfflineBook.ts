"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getReaderSession, searchBook, SEARCH_MAX, SEARCH_MIN, type ReaderError, type ReaderResult } from "@/lib/reader";
import { getOfflineStore, type SavedMeta } from "@/lib/offline-store";
import { type QueuedOp, type ReplayOutcome } from "@/lib/offline-queue";
import {
  EMPTY_STATE,
  PURGE_ERRORS,
  flushQueue,
  loadOfflinePackage,
  purgeOfflineBook,
  readQueue,
  reconcileOffline,
  removeBookOffline,
  saveBookOffline,
  queueWrite,
  writeOfflineState,
  type OfflineState,
  type SaveOfflineResult,
} from "@/lib/reader-offline";
import { searchChapterTexts } from "@/lib/reader-epub";
import type { EpubChapter, OfflinePackage, ReaderSession, SearchResponse } from "@/lib/types";
import { chapterFragment } from "./epub-dom";
import type { ReaderFatalError } from "./ReaderChrome";

/** The book opened from the local copy (Reader → EpubReader when the session call failed offline). */
export interface OfflineStart {
  package: OfflinePackage;
  state: OfflineState | null;
  meta: SavedMeta;
}

const STATE_SAVE_DELAY_MS = 800;

/**
 * Offline reading for one EPUB (Phase 6b): whether this browser can keep books, the local copy's
 * license, «reading from the local copy» mode, chapters/search from the package, the write queue and
 * its replay (on `online` and after the next successful call), license reconciliation and renewal.
 */
export function useOfflineBook({
  slug,
  session,
  start,
  onFatal,
  onReplayed,
}: {
  slug: string;
  session: ReaderSession;
  start: OfflineStart | null;
  onFatal: (e: ReaderFatalError) => void;
  onReplayed: (out: ReplayOutcome) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [meta, setMeta] = useState<SavedMeta | null>(start?.meta ?? null);
  const [offline, setOfflineState] = useState(start !== null);
  const [queued, setQueued] = useState(0);

  const offlineRef = useRef(start !== null);
  const pkgRef = useRef<OfflinePackage | null>(start?.package ?? null);
  const metaRef = useRef<SavedMeta | null>(start?.meta ?? null);
  const textsRef = useRef(new Map<number, string>());
  const stateRef = useRef<OfflineState>(start?.state ?? { ...EMPTY_STATE });
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRef = useRef(0);
  const sessionRef = useRef(session);
  const fatalRef = useRef(onFatal);
  const replayedRef = useRef(onReplayed);
  sessionRef.current = session;
  fatalRef.current = onFatal;
  replayedRef.current = onReplayed;

  const setOffline = useCallback((v: boolean) => {
    offlineRef.current = v;
    setOfflineState(v);
  }, []);
  const setMetaBoth = useCallback((m: SavedMeta | null) => {
    metaRef.current = m;
    setMeta(m);
  }, []);
  const setQueuedBoth = useCallback((n: number) => {
    queuedRef.current = n;
    setQueued(n);
  }, []);

  /* ---------- reading state snapshot (for opening offline later) ---------- */

  const persistState = useCallback(() => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    stateTimer.current = null;
    if (!metaRef.current) return;
    void writeOfflineState(slug, { ...stateRef.current, updatedAt: new Date().toISOString() });
  }, [slug]);

  /** Merge into the local snapshot; written (debounced) only while a local copy exists. */
  const updateState = useCallback(
    (patch: Partial<OfflineState>) => {
      stateRef.current = { ...stateRef.current, ...patch };
      if (!metaRef.current) return;
      if (stateTimer.current) clearTimeout(stateTimer.current);
      stateTimer.current = setTimeout(persistState, STATE_SAVE_DELAY_MS);
    },
    [persistState],
  );

  useEffect(
    () => () => {
      if (stateTimer.current) persistState();
    },
    [persistState],
  );

  /* ---------- queue ---------- */

  const flush = useCallback(async () => {
    const out = await flushQueue(slug);
    if (!out) return null;
    setQueuedBoth(out.remaining.length);
    replayedRef.current(out);
    return out;
  }, [slug, setQueuedBoth]);

  const queue = useCallback(
    async (op: QueuedOp) => {
      const res = await queueWrite(slug, op);
      if (res.ok) setQueuedBoth(res.size);
      return res.ok;
    },
    [slug, setQueuedBoth],
  );

  /** A call just succeeded: the network is back, so send what is waiting. */
  const noteOnline = useCallback(() => {
    if (queuedRef.current > 0) void flush();
  }, [flush]);

  /* ---------- package ---------- */

  /** Switch to reading from the local copy (when one exists and is still valid). */
  const enterOffline = useCallback(async () => {
    if (offlineRef.current && pkgRef.current) return true;
    const pkg = pkgRef.current ?? (await loadOfflinePackage(slug));
    if (!pkg) return false;
    pkgRef.current = pkg;
    setOffline(true);
    return true;
  }, [slug, setOffline]);

  const chapterFromPackage = useCallback((index: number): EpubChapter | null => {
    const pkg = pkgRef.current;
    if (!pkg) return null;
    return pkg.chapters.find((c) => c.index === index) ?? pkg.chapters[index] ?? null;
  }, []);

  const localSearch = useCallback((q: string): ReaderResult<SearchResponse> => {
    const pkg = pkgRef.current;
    if (!pkg) return { ok: false, error: { kind: "network" } };
    const query = q.trim().slice(0, SEARCH_MAX);
    if (query.length < SEARCH_MIN) return { ok: true, data: { results: [], truncated: false } };
    const texts = pkg.chapters.map((c) => {
      let text = textsRef.current.get(c.index);
      if (text === undefined) {
        // the same text the reader renders, so occurrences/offsets match
        text = chapterFragment(c.html).textContent ?? "";
        textsRef.current.set(c.index, text);
      }
      return { index: c.index, title: c.title, text };
    });
    return { ok: true, data: searchChapterTexts(texts, query) };
  }, []);

  /** Search: local in offline mode, and when the online search fails for lack of network. */
  const search = useCallback(
    async (q: string): Promise<ReaderResult<SearchResponse>> => {
      if (offlineRef.current && pkgRef.current) return localSearch(q);
      const res = await searchBook(slug, q);
      if (res.ok) {
        noteOnline();
        return res;
      }
      if (res.error.kind === "network" && (await enterOffline())) return localSearch(q);
      return res;
    },
    [slug, localSearch, enterOffline, noteOnline],
  );

  /* ---------- save / remove ---------- */

  const save = useCallback(async (): Promise<SaveOfflineResult> => {
    const res = await saveBookOffline(slug, sessionRef.current.book);
    if (res.ok) {
      pkgRef.current = res.package;
      textsRef.current.clear();
      setMetaBoth(res.meta);
      persistState();
    }
    return res;
  }, [slug, setMetaBoth, persistState]);

  const remove = useCallback(async (): Promise<ReaderResult<void>> => {
    const m = metaRef.current;
    if (!m) return { ok: true, data: undefined };
    const res = await removeBookOffline(slug, m.license.id);
    if (res.ok) {
      setMetaBoth(null);
      if (!offlineRef.current) pkgRef.current = null;
    }
    return res;
  }, [slug, setMetaBoth]);

  /* ---------- mount: availability, reconcile, pending queue ---------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await getOfflineStore();
      if (cancelled) return;
      setSupported(store !== null);
      if (!store) return;
      if (!start) {
        // online open: drop a revoked copy, renew one that is about to expire, send queued writes
        await reconcileOffline(slug, sessionRef.current).catch(() => "none");
        const m = await store.getMeta(slug).catch(() => null);
        if (cancelled) return;
        setMetaBoth(m);
        const pending = (await readQueue(slug)).length;
        if (cancelled) return;
        setQueuedBoth(pending);
        if (pending) void flush();
      } else {
        setQueuedBoth((await readQueue(slug)).length);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* ---------- back online ---------- */

  useEffect(() => {
    const onOnline = async () => {
      if (!offlineRef.current) {
        void flush();
        return;
      }
      // reading from the local copy: check the entitlement/license first, then go back to the network
      const res = await getReaderSession(slug);
      if (!res.ok) {
        if (PURGE_ERRORS.includes(res.error.kind)) {
          await purgeOfflineBook(slug);
          fatalRef.current(res.error as ReaderError);
        } else if (res.error.kind === "device_limit") {
          fatalRef.current(res.error);
        }
        return;
      }
      await reconcileOffline(slug, res.data).catch(() => "none");
      const store = await getOfflineStore();
      setMetaBoth((await store?.getMeta(slug).catch(() => null)) ?? null);
      setOffline(false);
      void flush();
    };
    const handler = () => void onOnline();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [slug, flush, setOffline, setMetaBoth]);

  return {
    /** null while checking; false: no IndexedDB/WebCrypto here (private window, old browser) */
    supported,
    /** this device's local copy (license + saved date), or null */
    meta,
    /** reading from the local copy */
    offline,
    offlineRef,
    /** writes waiting for the network */
    queued,
    enterOffline,
    chapterFromPackage,
    search,
    queue,
    flush,
    noteOnline,
    updateState,
    save,
    remove,
    setMeta: setMetaBoth,
  };
}

export type OfflineBook = ReturnType<typeof useOfflineBook>;
