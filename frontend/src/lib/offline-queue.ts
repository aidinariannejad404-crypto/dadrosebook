import type { Bookmark, Highlight, HighlightColor, HighlightCreate } from "./types";

/**
 * Writes the EPUB reader makes while offline (Phase 6b), kept per book and replayed in order once a
 * call succeeds again or the browser fires `online`. Pure: storage and HTTP are passed in.
 *
 * Objects created offline get a negative temporary id; later edits/deletes of that object are folded
 * into the queued create, so the server never sees a temporary id.
 */

export type ProgressBody = { page: number; total_pages: number; location: string };
export type BookmarkBody = { page: number; location: string; label: string };
export type HighlightPatch = { note?: string; color?: HighlightColor };

export type QueuedOp =
  | { kind: "progress"; body: ProgressBody }
  | { kind: "highlight-create"; tempId: number; body: HighlightCreate }
  | { kind: "highlight-update"; id: number; body: HighlightPatch }
  | { kind: "highlight-delete"; id: number }
  | { kind: "bookmark-create"; tempId: number; body: BookmarkBody }
  | { kind: "bookmark-delete"; id: number }
  | { kind: "copy"; chars: number };

export const MAX_QUEUED_OPS = 1000;

export const isTempId = (id: number) => id < 0;

let lastTemp = 0;
/** A fresh negative id for an object created offline (unique within this page). */
export function tempId(now: number = Date.now()): number {
  const next = -Math.max(now, lastTemp + 1);
  lastTemp = -next;
  return next;
}

/**
 * Add `op` to the queue, folding it into what is already there:
 * progress keeps only the latest; copies add up; an update/delete of an object created offline
 * edits/removes its queued create; a delete drops pending updates of that object.
 */
export function enqueueOp(ops: readonly QueuedOp[], op: QueuedOp): QueuedOp[] {
  switch (op.kind) {
    case "progress":
      return [...ops.filter((o) => o.kind !== "progress"), op];
    case "copy": {
      const chars = Math.max(0, Math.floor(op.chars));
      if (!chars) return [...ops];
      const prev = ops.find((o) => o.kind === "copy");
      if (prev && prev.kind === "copy") return ops.map((o) => (o === prev ? { kind: "copy", chars: prev.chars + chars } : o));
      return [...ops, { kind: "copy", chars }];
    }
    case "highlight-update": {
      if (isTempId(op.id)) {
        return ops.map((o) =>
          o.kind === "highlight-create" && o.tempId === op.id ? { ...o, body: { ...o.body, ...op.body } } : o,
        );
      }
      const prev = ops.find((o) => o.kind === "highlight-update" && o.id === op.id);
      if (prev && prev.kind === "highlight-update") {
        return ops.map((o) => (o === prev ? { ...prev, body: { ...prev.body, ...op.body } } : o));
      }
      return [...ops, op];
    }
    case "highlight-delete": {
      if (isTempId(op.id)) return ops.filter((o) => !(o.kind === "highlight-create" && o.tempId === op.id));
      return [...ops.filter((o) => !(o.kind === "highlight-update" && o.id === op.id)), op];
    }
    case "bookmark-delete": {
      if (isTempId(op.id)) return ops.filter((o) => !(o.kind === "bookmark-create" && o.tempId === op.id));
      return [...ops, op];
    }
    default:
      return [...ops, op];
  }
}

/** The local object a queued create stands for (shown in the reader until the server answers). */
export function localHighlight(id: number, body: HighlightCreate, now: string): Highlight {
  return {
    id,
    page: body.page,
    text: body.text,
    note: body.note ?? "",
    color: body.color ?? "yellow",
    rects: body.rects,
    location: body.location ?? "",
    created_at: now,
    updated_at: now,
  };
}

export function localBookmark(id: number, body: BookmarkBody, now: string): Bookmark {
  return { id, ...body, created_at: now };
}

/** Outcome of one replayed call: done, retry later (network/throttled) or drop (rejected by the server). */
export type OpResult<T = unknown> = { status: "done"; data?: T } | { status: "retry" } | { status: "drop" };

export interface OpExecutor {
  progress(body: ProgressBody): Promise<OpResult>;
  createHighlight(body: HighlightCreate): Promise<OpResult<Highlight>>;
  updateHighlight(id: number, body: HighlightPatch): Promise<OpResult<Highlight>>;
  deleteHighlight(id: number): Promise<OpResult>;
  createBookmark(body: BookmarkBody): Promise<OpResult<Bookmark>>;
  deleteBookmark(id: number): Promise<OpResult>;
  copy(chars: number): Promise<OpResult>;
}

export interface ReplayOutcome {
  /** ops still to send (the first one that could not be sent and everything after it) */
  remaining: QueuedOp[];
  /** temporary id → the server's object (or null when the server refused it) */
  highlights: Map<number, Highlight | null>;
  bookmarks: Map<number, Bookmark | null>;
  sent: number;
}

/** Send the ops in order; stop at the first one that should be retried later. */
export async function replayOps(ops: readonly QueuedOp[], exec: OpExecutor): Promise<ReplayOutcome> {
  const out: ReplayOutcome = { remaining: [], highlights: new Map(), bookmarks: new Map(), sent: 0 };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    let res: OpResult<unknown>;
    try {
      switch (op.kind) {
        case "progress":
          res = await exec.progress(op.body);
          break;
        case "highlight-create":
          res = await exec.createHighlight(op.body);
          if (res.status === "done") out.highlights.set(op.tempId, (res.data as Highlight | undefined) ?? null);
          if (res.status === "drop") out.highlights.set(op.tempId, null);
          break;
        case "highlight-update":
          res = await exec.updateHighlight(op.id, op.body);
          break;
        case "highlight-delete":
          res = await exec.deleteHighlight(op.id);
          break;
        case "bookmark-create":
          res = await exec.createBookmark(op.body);
          if (res.status === "done") out.bookmarks.set(op.tempId, (res.data as Bookmark | undefined) ?? null);
          if (res.status === "drop") out.bookmarks.set(op.tempId, null);
          break;
        case "bookmark-delete":
          res = await exec.deleteBookmark(op.id);
          break;
        case "copy":
          res = await exec.copy(op.chars);
          break;
      }
    } catch {
      res = { status: "retry" };
    }
    if (res.status === "retry") {
      out.remaining = ops.slice(i);
      return out;
    }
    if (res.status === "done") out.sent++;
  }
  return out;
}

/** Apply a replay's id mapping to the reader's lists (temporary objects → server objects). */
export function applyIdMap<T extends { id: number }>(items: readonly T[], map: Map<number, T | null>): T[] {
  if (!map.size) return [...items];
  const out: T[] = [];
  for (const item of items) {
    if (!map.has(item.id)) {
      out.push(item);
      continue;
    }
    const real = map.get(item.id);
    if (real && !out.some((x) => x.id === real.id)) out.push(real);
  }
  return out;
}
