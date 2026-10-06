import { foldChar } from "./reader-epub";
import type { Bookmark, Highlight } from "./types";

/**
 * ه۱ — client half of «annotations survive a new file version».
 *
 * The server re-anchors highlights by text when a new file version goes live (apps/reader/services/
 * reanchor.py). PDF highlights it moves come back with no boxes (`rects: []`); the reader finds the
 * text again in the page's text layer with the same «compact» comparison the server uses (folded
 * letters/digits, no whitespace or ZWNJ), so spacing differences between extractors do not matter.
 * Items the server could not find are `anchor_status: "orphaned"` and are listed apart.
 */

const GAP = /[\s‌‍‎‏ـ]/;

/** Folded text without whitespace/ZWNJ/tatweel (the server's `anchoring.compact`). */
export function compactText(text: string): string {
  let out = "";
  for (const ch of text) {
    const f = foldChar(ch);
    if (!GAP.test(f)) out += f;
  }
  return out;
}

export interface ChunkPoint {
  chunk: number;
  offset: number;
}

/**
 * Where `quote` starts and ends across consecutive text chunks (e.g. the text nodes of a PDF text
 * layer), comparing compact text. `end` is exclusive. Null when absent or the quote is empty.
 * With several matches, `prefer` (a compact context string seen just before the quote) picks the one
 * whose preceding text agrees most; otherwise the first.
 */
export function locateInChunks(
  chunks: string[],
  quote: string,
  prefer = "",
): { start: ChunkPoint; end: ChunkPoint } | null {
  const needle = compactText(quote);
  if (!needle) return null;
  let hay = "";
  const map: ChunkPoint[] = [];
  chunks.forEach((text, chunk) => {
    for (let i = 0; i < text.length; i++) {
      const f = foldChar(text[i]!);
      if (GAP.test(f)) continue;
      hay += f;
      map.push({ chunk, offset: i });
    }
  });
  const hits: number[] = [];
  for (let pos = hay.indexOf(needle); pos !== -1 && hits.length < 200; pos = hay.indexOf(needle, pos + 1)) hits.push(pos);
  if (!hits.length) return null;
  const before = compactText(prefer);
  const score = (pos: number) => {
    let n = 0;
    while (n < before.length && pos - n - 1 >= 0 && hay[pos - n - 1] === before[before.length - n - 1]) n++;
    return n;
  };
  const best = before ? hits.reduce((a, b) => (score(b) > score(a) ? b : a)) : hits[0]!;
  const first = map[best]!;
  const last = map[best + needle.length - 1]!;
  return { start: first, end: { chunk: last.chunk, offset: last.offset + 1 } };
}

/** Split a book's annotations: those placed in the current file, and «جابه‌جا شده» ones. */
export function splitRelocated<T extends Pick<Highlight | Bookmark, "anchor_status">>(items: T[]): { placed: T[]; relocated: T[] } {
  const placed: T[] = [];
  const relocated: T[] = [];
  for (const item of items) (item.anchor_status === "orphaned" ? relocated : placed).push(item);
  return { placed, relocated };
}

/** Short Persian explanation for a relocated item («در نسخه قبلی: صفحه ۱۲»). */
export function relocatedHint(item: Pick<Highlight, "previous_page" | "page">, toFa: (n: number) => string): string {
  const page = item.previous_page ?? item.page;
  return page ? `در نسخه قبلی: صفحه ${toFa(page)}` : "در نسخه قبلی";
}
