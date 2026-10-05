"use client";

import { useEffect, useState } from "react";
import { formatJalaliDate } from "@/lib/format";
import { getOfflineStore, type SavedMeta } from "@/lib/offline-store";

let listing: Promise<Map<string, SavedMeta>> | null = null;

/** Local copies on this browser (one IndexedDB read shared by every card on the page). */
function localCopies(): Promise<Map<string, SavedMeta>> {
  listing ??= (async () => {
    const store = await getOfflineStore();
    const list = (await store?.listPackages().catch(() => [])) ?? [];
    return new Map(list.map((m) => [m.slug, m]));
  })();
  return listing;
}

/** «آفلاین» on a library card when this book is saved for offline reading on this device (Phase 6b). */
export function OfflineBadge({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<SavedMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    void localCopies().then((m) => {
      if (!cancelled) setMeta(m.get(slug) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  if (!meta) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success"
      title={`ذخیره‌شده روی این دستگاه تا ${formatJalaliDate(meta.license.expires_at)}`}
    >
      آفلاین
      <span className="sr-only">{` — روی این دستگاه تا ${formatJalaliDate(meta.license.expires_at)}`}</span>
    </span>
  );
}
