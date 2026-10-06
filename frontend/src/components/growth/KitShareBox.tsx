"use client";

import { useState } from "react";
import { trackKitShared } from "@/lib/analytics";
import { kitSlugsUrl, type KitShareCreated } from "@/lib/growth";
import { toPersianDigits } from "@/lib/format";
import { apiFetch } from "@/lib/session";
import { ShareLinks } from "./ShareLinks";

/**
 * و۳: «اشتراک‌گذاری کیت» in the kit builder. Creates a short link (`/kit?k=<token>`) that reproduces
 * exam + books + formats for the recipient; falls back to `/kit?exam=…&b=slug,…` when the API fails.
 */
export function KitShareBox({
  exam,
  examName,
  variantIds,
  slugs,
}: {
  exam: string | null;
  examName: string;
  variantIds: number[];
  slugs: string[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = variantIds.join(",");
  const [forKey, setForKey] = useState(key);
  if (forKey !== key) {
    // the selection changed: the old link no longer matches it
    setForKey(key);
    setUrl(null);
  }
  if (variantIds.length === 0) return null;

  async function create() {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch<KitShareCreated>("/growth/kit-shares/", {
      method: "POST",
      json: { exam, variant_ids: variantIds },
    });
    setBusy(false);
    const path = res.ok ? res.data.path : kitSlugsUrl(exam, slugs);
    setUrl(`${window.location.origin}${path}`);
  }

  const text = `کیت مطالعاتی ${examName ? `آزمون ${examName}` : "آزمون"}: ${toPersianDigits(variantIds.length)} کتاب — با یک لمس همه را به سبد اضافه کن`;

  return (
    <section aria-labelledby="kit-share-title" className="mt-4 border-t border-line pt-4">
      <h3 id="kit-share-title" className="text-sm font-black text-ink">
        ارسال به گروه مطالعه
      </h3>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        فهرست کتاب‌ها و نسخه‌های انتخابی‌تان را برای دوستانتان بفرستید؛ آن‌ها با یک لمس همه را به سبد اضافه می‌کنند.
      </p>
      {url ? (
        <ShareLinks
          url={url}
          text={text}
          className="mt-3"
          onShare={(channel) => trackKitShared({ exam_type: exam, books: variantIds.length, channel })}
        />
      ) : (
        <button
          type="button"
          onClick={create}
          aria-disabled={busy || undefined}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control border-2 border-primary px-4 text-sm font-extrabold text-primary hover:bg-primary-soft"
        >
          {busy ? "در حال ساخت لینک…" : "ساخت لینک اشتراک کیت"}
        </button>
      )}
    </section>
  );
}
