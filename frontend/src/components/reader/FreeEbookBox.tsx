"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackFreeEbookClaimed } from "@/lib/analytics";
import { routes } from "@/lib/config";
import { claimFreeEbook, sampleHref } from "@/lib/reader-stream";
import { BookOpenIcon } from "@/components/ui/Icons";

/**
 * ه۶ «دریافت رایگان» (statute texts): adds the free ebook to the visitor's library (login required)
 * and opens it in the reader.
 */
export function FreeEbookBox({ slug, ready, className = "" }: { slug: string; ready: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const claim = async () => {
    setBusy(true);
    setError("");
    const res = await claimFreeEbook(slug);
    if (res.ok) {
      trackFreeEbookClaimed({ book: slug, created: res.created });
      router.push(routes.read(slug));
      return;
    }
    setBusy(false);
    const e = res.error;
    if (e.kind === "auth") {
      router.push(`${routes.login}?next=${encodeURIComponent(routes.product(slug))}`);
      return;
    }
    setError(
      e.kind === "not_free"
        ? e.message
        : e.kind === "throttled"
          ? "کمی صبر کنید و دوباره تلاش کنید."
          : "دریافت انجام نشد. دوباره تلاش کنید.",
    );
  };

  return (
    <section aria-label="دریافت رایگان" className={`rounded-card border-2 border-success bg-surface p-4 shadow-card ${className}`}>
      <p className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">رایگان</span>
        متن کامل این کتاب الکترونیک رایگان است.
      </p>
      <p className="mt-1 text-xs leading-6 text-ink-muted">با ورود به حساب، کتاب به کتابخانه شما اضافه می‌شود و در کتاب‌خوان باز می‌شود.</p>
      {ready ? (
        <button
          type="button"
          onClick={() => void claim()}
          disabled={busy}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-success px-5 font-bold text-surface hover:opacity-90 disabled:opacity-60"
        >
          <BookOpenIcon size={20} />
          {busy ? "در حال افزودن…" : "دریافت رایگان"}
        </button>
      ) : (
        <p className="mt-3 text-sm font-bold text-ink-muted">نسخه الکترونیک به‌زودی آماده می‌شود.</p>
      )}
      <p role="alert" className="mt-2 min-h-5 text-sm font-bold text-danger">
        {error}
      </p>
    </section>
  );
}

/** د۵ «نمونه را در کتاب‌خوان بخوانید» (the real reader, no login). */
export function ReaderSampleLink({ slug, prominent }: { slug: string; prominent: boolean }) {
  return (
    <Link
      href={sampleHref(slug)}
      prefetch={false}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold text-primary hover:bg-primary-soft ${
        prominent ? "border-2 border-primary bg-surface" : ""
      }`}
    >
      <BookOpenIcon size={20} />
      نمونه را در کتاب‌خوان بخوانید
    </Link>
  );
}
