"use client";

import type { PdfDocument } from "@/components/reader/pdfjs";

type Dest = unknown[] | string | null;

/**
 * First pages of the PDF's top-level outline entries (its chapters), ascending. Empty when the
 * file has no outline or it cannot be resolved; the reader then estimates to the end of the book.
 */
export async function pdfChapterStarts(doc: PdfDocument): Promise<number[]> {
  try {
    const outline = await doc.getOutline();
    if (!outline?.length) return [];
    const pages = await Promise.all(
      outline.map(async (entry) => {
        try {
          let dest = entry.dest as Dest;
          if (typeof dest === "string") dest = (await doc.getDestination(dest)) as Dest;
          if (!Array.isArray(dest) || dest[0] == null) return null;
          const ref = dest[0];
          if (typeof ref === "number") return ref + 1;
          return (await doc.getPageIndex(ref as Parameters<PdfDocument["getPageIndex"]>[0])) + 1;
        } catch {
          return null;
        }
      }),
    );
    return [...new Set(pages.filter((p): p is number => p != null))].sort((a, b) => a - b);
  } catch {
    return [];
  }
}
