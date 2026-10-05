import {
  createBookmark,
  createHighlight,
  deleteBookmark,
  deleteHighlight,
  deleteOfflineLicense,
  recordCopy,
  requestOfflineCopy,
  saveProgress,
  updateHighlight,
  type ReaderError,
  type ReaderResult,
} from "./reader";
import { getOfflineStore, needsRenewal, toStoredLicense, type SavedMeta } from "./offline-store";
import { enqueueOp, MAX_QUEUED_OPS, replayOps, type OpResult, type QueuedOp, type ReplayOutcome } from "./offline-queue";
import { forgetReader, precacheReader } from "./reader-sw";
import type { Bookmark, CopyQuota, Highlight, OfflinePackage, ReaderSession, ReadingProgress } from "./types";

/**
 * Offline reading glue (Phase 6b): the book package and the reading state in the encrypted store,
 * license reconciliation with the server, and the offline write queue. React-free; the reader's
 * `useOfflineBook` hook drives it.
 */

/** What is encrypted per book in `books`. */
export interface OfflineBookPayload {
  book: ReaderSession["book"];
  package: OfflinePackage;
}

/** What is encrypted per book in `state` (the reader's last known view, for opening offline). */
export interface OfflineState {
  progress: ReadingProgress | null;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  copy_quota: CopyQuota | null;
  updatedAt: string;
}

export const EMPTY_STATE: OfflineState = { progress: null, highlights: [], bookmarks: [], copy_quota: null, updatedAt: "" };

/* ---------- pure helpers (unit-tested) ---------- */

/** Shape check of a package from the server or the store (the html is sanitized again on render). */
export function isOfflinePackage(v: unknown): v is OfflinePackage {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  const epub = p.epub as Record<string, unknown> | null | undefined;
  if (!epub || typeof epub !== "object" || !Array.isArray(epub.chapters) || typeof epub.total_pages !== "number") return false;
  if (!Array.isArray(p.chapters) || p.chapters.length === 0) return false;
  if (typeof p.watermark !== "string" || typeof p.copy_limit !== "number") return false;
  return p.chapters.every((c) => {
    const ch = c as Record<string, unknown> | null;
    return !!ch && typeof ch.index === "number" && typeof ch.html === "string" && typeof ch.title === "string";
  });
}

export function isOfflineBookPayload(v: unknown): v is OfflineBookPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  const book = p.book as Record<string, unknown> | null | undefined;
  return !!book && typeof book.title === "string" && isOfflinePackage(p.package);
}

/** A reader session built from the local copy (no network): the shape the reader already renders. */
export function sessionFromOffline(
  slug: string,
  meta: Pick<SavedMeta, "license">,
  payload: OfflineBookPayload,
  state: OfflineState | null,
): ReaderSession {
  const pkg = payload.package;
  return {
    book: { ...payload.book, slug },
    file: { format: "EPUB", version: 0, url: "", expires_at: meta.license.expires_at },
    progress: state?.progress ?? null,
    watermark: pkg.watermark,
    copy_limit: pkg.copy_limit,
    epub: pkg.epub,
    copy_quota: state?.copy_quota ?? pkg.copy_quota ?? null,
    offline: {
      max_books: 0,
      days: 0,
      license: {
        id: meta.license.id,
        book: slug,
        title: meta.license.title,
        device_label: "",
        expires_at: meta.license.expires_at,
        created_at: "",
      },
    },
  };
}

/** Replay outcome for one HTTP answer: network/throttle/auth → retry later; other errors → drop. */
export function opResult<T>(res: ReaderResult<T>): OpResult<T> {
  if (res.ok) return { status: "done", data: res.data };
  const k = res.error.kind;
  if (k === "network" || k === "throttled" || k === "auth") return { status: "retry" };
  if (k === "http" && res.error.status >= 500) return { status: "retry" };
  return { status: "drop" };
}

/** Errors after which the local copy must go (entitlement gone or the user signed out). */
export const PURGE_ERRORS: ReaderError["kind"][] = ["auth", "forbidden", "no_ebook"];

/* ---------- book package ---------- */

export type SaveOfflineResult =
  | { ok: true; meta: SavedMeta; package: OfflinePackage }
  | { ok: false; error: ReaderError | { kind: "unsupported" } | { kind: "invalid" } | { kind: "storage" } };

/** POST /offline/ → encrypt and keep the package → precache the shell. Also used for silent renewal. */
export async function saveBookOffline(slug: string, book: ReaderSession["book"]): Promise<SaveOfflineResult> {
  const store = await getOfflineStore();
  if (!store) return { ok: false, error: { kind: "unsupported" } };
  const res = await requestOfflineCopy(slug);
  if (!res.ok) return { ok: false, error: res.error };
  const { license, package: pkg } = res.data;
  if (!license || !isOfflinePackage(pkg)) return { ok: false, error: { kind: "invalid" } };
  const stored = toStoredLicense({ ...license, book: license.book || slug });
  const payload: OfflineBookPayload = { book, package: pkg };
  try {
    await store.savePackage(slug, stored, payload);
  } catch {
    // quota exceeded / storage refused: give the license back so it does not use a slot
    void deleteOfflineLicense(license.id);
    return { ok: false, error: { kind: "storage" } };
  }
  void precacheReader(slug);
  return { ok: true, meta: { slug, license: stored, savedAt: new Date().toISOString() }, package: pkg };
}

/** Delete the local copy (package + cached state) and the cached shell. */
export async function purgeOfflineBook(slug: string): Promise<void> {
  const store = await getOfflineStore();
  if (!store) return;
  try {
    await store.deletePackage(slug);
  } catch {
    /* nothing to delete */
  }
  void forgetReader(slug);
}

/** «حذف نسخه آفلاین»: DELETE the license (404 = already gone), then delete the local copy. */
export async function removeBookOffline(slug: string, licenseId: number): Promise<ReaderResult<void>> {
  const res = await deleteOfflineLicense(licenseId);
  // 404 (mapped to «no_ebook») = the license is already gone
  if (!res.ok && res.error.kind !== "no_ebook") return res;
  await purgeOfflineBook(slug);
  return { ok: true, data: undefined };
}

export interface OpenedOffline {
  session: ReaderSession;
  package: OfflinePackage;
  state: OfflineState | null;
  meta: SavedMeta;
}

/** The book from the local copy when it exists and its license is still valid (else null). */
export async function openOfflineBook(slug: string): Promise<OpenedOffline | null> {
  const store = await getOfflineStore();
  if (!store) return null;
  try {
    const loaded = await store.loadPackage<unknown>(slug);
    if (!loaded) return null;
    if (!isOfflineBookPayload(loaded.payload)) {
      await store.deletePackage(slug);
      return null;
    }
    const state = await store.readDoc<OfflineState>("state", slug);
    const meta: SavedMeta = { slug, license: loaded.license, savedAt: loaded.savedAt };
    return {
      session: sessionFromOffline(slug, meta, loaded.payload, state),
      package: loaded.payload.package,
      state,
      meta,
    };
  } catch {
    return null;
  }
}

/** Load just the package (online reader falling back mid-session). */
export async function loadOfflinePackage(slug: string): Promise<OfflinePackage | null> {
  const opened = await openOfflineBook(slug);
  return opened?.package ?? null;
}

export type Reconciled = "none" | "deleted" | "renewed" | "kept";

/**
 * After an online session load: no license on the server for this device (revoked, expired, offline
 * reading disabled, PDF) → delete the local copy; fewer than 3 days left → renew silently.
 */
export async function reconcileOffline(slug: string, session: ReaderSession, now: number = Date.now()): Promise<Reconciled> {
  const store = await getOfflineStore();
  if (!store) return "none";
  const meta = await store.getMeta(slug, now);
  if (!meta) return "none";
  const license = session.file.format === "EPUB" ? (session.offline?.license ?? null) : null;
  if (!license) {
    await purgeOfflineBook(slug);
    return "deleted";
  }
  if (license.id !== meta.license.id || license.expires_at !== meta.license.expires_at) {
    await store.updateLicense(slug, toStoredLicense({ ...license, book: license.book || slug }));
  }
  if (needsRenewal(license.expires_at, now)) {
    const res = await saveBookOffline(slug, session.book);
    return res.ok ? "renewed" : "kept";
  }
  void precacheReader(slug);
  return "kept";
}

/* ---------- reading state ---------- */

export async function readOfflineState(slug: string): Promise<OfflineState | null> {
  const store = await getOfflineStore();
  if (!store) return null;
  try {
    return await store.readDoc<OfflineState>("state", slug);
  } catch {
    return null;
  }
}

export async function writeOfflineState(slug: string, state: OfflineState): Promise<void> {
  const store = await getOfflineStore();
  if (!store) return;
  try {
    await store.writeDoc("state", slug, state);
  } catch {
    /* storage full: the online copy is the source of truth anyway */
  }
}

/* ---------- write queue ---------- */

const locks = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier queue operation of this book (no lost updates within the page). */
function withLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(slug) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    slug,
    next.catch(() => undefined),
  );
  return next;
}

export async function readQueue(slug: string): Promise<QueuedOp[]> {
  const store = await getOfflineStore();
  if (!store) return [];
  try {
    const ops = await store.readDoc<QueuedOp[]>("queue", slug);
    return Array.isArray(ops) ? ops : [];
  } catch {
    return [];
  }
}

/** Queue a write for later; false when there is no local store (the caller reports the failure). */
export function queueWrite(slug: string, op: QueuedOp): Promise<{ ok: boolean; size: number }> {
  return withLock(slug, async () => {
    const store = await getOfflineStore();
    if (!store) return { ok: false, size: 0 };
    try {
      const ops = enqueueOp(await readQueue(slug), op).slice(-MAX_QUEUED_OPS);
      await store.writeDoc("queue", slug, ops);
      return { ok: true, size: ops.length };
    } catch {
      return { ok: false, size: 0 };
    }
  });
}

/** Replay this book's queued writes in order; keeps whatever could not be sent yet. */
export function flushQueue(slug: string): Promise<ReplayOutcome | null> {
  return withLock(slug, async () => {
    const store = await getOfflineStore();
    if (!store) return null;
    const ops = await readQueue(slug);
    if (!ops.length) return null;
    const out = await replayOps(ops, {
      progress: async (body) => opResult(await saveProgress(slug, body)),
      createHighlight: async (body) => opResult(await createHighlight(slug, body)),
      updateHighlight: async (id, body) => opResult(await updateHighlight(slug, id, body)),
      // a 404 (already gone on the server) is dropped like any other refusal
      deleteHighlight: async (id) => opResult(await deleteHighlight(slug, id)),
      createBookmark: async (body) => opResult(await createBookmark(slug, body)),
      deleteBookmark: async (id) => opResult(await deleteBookmark(slug, id)),
      copy: async (chars) => opResult(await recordCopy(slug, chars)),
    });
    try {
      if (out.remaining.length) await store.writeDoc("queue", slug, out.remaining);
      else await store.deleteDoc("queue", slug);
    } catch {
      /* keep going: worst case some ops are sent twice (progress/copies are idempotent enough) */
    }
    return out;
  });
}
