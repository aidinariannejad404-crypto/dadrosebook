"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { accountRoutes } from "@/lib/account-routes";
import { formatJalaliDate, formatNumber } from "@/lib/format";
import { deleteOfflineLicense, listOfflineLicenses, type ReaderError } from "@/lib/reader";
import { getOfflineStore, type SavedMeta } from "@/lib/offline-store";
import { purgeOfflineBook } from "@/lib/reader-offline";
import type { OfflineLicense } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { BookOpenIcon } from "@/components/ui/Icons";

type State = { status: "loading" } | { status: "error"; error: ReaderError } | { status: "ready"; licenses: OfflineLicense[] };

async function localCopies(): Promise<Map<string, SavedMeta>> {
  const store = await getOfflineStore();
  const list = (await store?.listPackages().catch(() => [])) ?? [];
  return new Map(list.map((m) => [m.slug, m]));
}

/**
 * «کتاب‌های آفلاین» (Phase 6b) on «دستگاه‌های من»: the account's live offline licenses
 * (GET /library/offline/), the ones kept in this browser marked «این دستگاه», each removable
 * (DELETE /library/offline/<id>/ and, when it is this browser's copy, the local copy too).
 */
export function OfflineBooks() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [local, setLocal] = useState<Map<string, SavedMeta>>(new Map());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [res, copies] = await Promise.all([listOfflineLicenses(), localCopies()]);
    setLocal(copies);
    setState(res.ok ? { status: "ready", licenses: res.data } : { status: "error", error: res.error });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(l: OfflineLicense) {
    setBusyId(l.id);
    setMessage("");
    const res = await deleteOfflineLicense(l.id);
    if (!res.ok && res.error.kind !== "no_ebook") {
      setBusyId(null);
      setMessage(res.error.kind === "network" ? "اتصال برقرار نشد. دوباره تلاش کنید." : "حذف انجام نشد. دوباره تلاش کنید.");
      return;
    }
    if (local.get(l.book)?.license.id === l.id) await purgeOfflineBook(l.book);
    setBusyId(null);
    setMessage(`نسخه آفلاین «${l.title || l.book}» حذف شد.`);
    await load();
  }

  return (
    <section aria-labelledby="offline-books-heading" className="mt-8">
      <h2 id="offline-books-heading" className="mb-1 text-lg font-black text-ink">
        کتاب‌های آفلاین
      </h2>
      <p className="mb-3 text-sm leading-7 text-ink-muted">
        کتاب‌هایی که برای مطالعه بدون اینترنت روی دستگاه‌هایتان ذخیره شده‌اند. با حذف هر کدام، جای آن برای کتاب دیگری آزاد
        می‌شود.
      </p>
      <p role="status" aria-live="polite" className="mb-3 text-sm font-bold text-success empty:hidden">
        {message}
      </p>

      {state.status === "loading" && (
        <div role="status">
          <span className="sr-only">در حال بارگذاری کتاب‌های آفلاین…</span>
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <p className="leading-8 text-ink-muted">
            {state.error.kind === "network"
              ? "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید."
              : "فهرست کتاب‌های آفلاین فعلاً در دسترس نیست."}
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              void load();
            }}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 font-bold text-white hover:bg-primary-hover"
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {state.status === "ready" &&
        (state.licenses.length === 0 ? (
          <p className="rounded-card bg-surface p-4 leading-8 text-ink-muted shadow-card">
            هنوز کتابی را برای مطالعه آفلاین ذخیره نکرده‌اید. در صفحه مطالعه هر کتاب الکترونیک (EPUB)، از «تنظیمات نمایش» گزینه
            «ذخیره برای مطالعه آفلاین» را بزنید.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs font-bold text-ink-muted">{`${formatNumber(state.licenses.length)} کتاب آفلاین`}</p>
            <ul className="space-y-3">
              {state.licenses.map((l) => {
                const here = local.get(l.book)?.license.id === l.id;
                return (
                  <li key={l.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <BookOpenIcon size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={accountRoutes.read(l.book)} prefetch={false} className="truncate font-bold text-ink hover:text-primary hover:underline">
                          {l.title || l.book}
                        </Link>
                        {here && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">این دستگاه</span>}
                      </p>
                      <p className="text-xs leading-6 text-ink-muted">
                        <bdi>{l.device_label || "دستگاه ناشناس"}</bdi> · تا{" "}
                        <time dateTime={l.expires_at}>{formatJalaliDate(l.expires_at)}</time>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void remove(l)}
                      aria-label={`حذف نسخه آفلاین ${l.title || l.book}`}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
                    >
                      {busyId === l.id ? "در حال حذف…" : "حذف"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ))}
    </section>
  );
}
