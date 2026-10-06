"use client";

/**
 * pdf.js loader — browser only, imported dynamically so it never enters the server bundle.
 * The legacy build supports older mobile Safari/Chrome; the worker is bundled by webpack
 * (`new URL(..., import.meta.url)`) and handed to pdf.js as a port.
 */
export type PdfjsLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
export type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;
export type PdfPage = import("pdfjs-dist").PDFPageProxy;

let libPromise: Promise<PdfjsLib> | null = null;

export function loadPdfjs(): Promise<PdfjsLib> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
      if (!lib.GlobalWorkerOptions.workerPort) {
        lib.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" },
        );
      }
      return lib;
    });
    libPromise.catch(() => {
      libPromise = null;
    });
  }
  return libPromise;
}

/**
 * Fetch and open the whole document once: no range requests or streaming (the signed URL is
 * short-lived). The signed URL is self-authenticating, so no cookies are sent with it (S3 CORS).
 */
export async function openPdf(url: string): Promise<PdfDocument> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({
    url,
    withCredentials: false,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    enableXfa: false,
  });
  return task.promise;
}

/** Errors that mean the bytes are not a PDF — retrying with a fresh URL will not help. */
export function isInvalidPdfError(err: unknown): boolean {
  return err instanceof Error && err.name === "InvalidPDFException";
}
