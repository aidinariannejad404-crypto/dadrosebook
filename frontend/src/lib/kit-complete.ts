/**
 * «درس کامل شد» (ج۸ signature moment): a kit subject is complete when every essential book of it is
 * in the cart (any format). Subjects without essential books never count as complete.
 */
import type { StudyKit } from "./types";

export function completeSubjects(kits: readonly StudyKit[], cartBookIds: ReadonlySet<number>): Set<string> {
  const done = new Set<string>();
  for (const k of kits) {
    const essential = k.items.filter((i) => i.is_essential);
    if (essential.length > 0 && essential.every((i) => cartBookIds.has(i.book.id))) done.add(k.subject.slug);
  }
  return done;
}

/** Slugs complete in `next` but not in `prev` (prev null = first load: nothing to celebrate). */
export function newlyComplete(prev: ReadonlySet<string> | null, next: ReadonlySet<string>): string[] {
  if (prev == null) return [];
  return [...next].filter((s) => !prev.has(s));
}

/** True when a count went up (the cart badge «bump»); the first known value never bumps. */
export function shouldBump(prev: number | null, next: number): boolean {
  return prev != null && next > prev;
}
