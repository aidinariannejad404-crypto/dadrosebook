"use client";

import Link from "next/link";
import { useState } from "react";
import { accountRoutes } from "@/lib/account-routes";
import { formatJalaliDate, formatNumber } from "@/lib/format";
import { deleteOfflineLicense } from "@/lib/reader";
import { getOfflineStore } from "@/lib/offline-store";
import { purgeOfflineBook } from "@/lib/reader-offline";
import type { OfflineInfo, OfflineLicense } from "@/lib/types";
import { CheckIcon, DownloadIcon } from "@/components/ui/Icons";
import type { OfflineBook } from "./useOfflineBook";

function saveErrorText(kind: string): string {
  switch (kind) {
    case "unsupported":
      return "این مرورگر امکان نگه‌داری امن کتاب را ندارد.";
    case "storage":
      return "فضای کافی برای ذخیره کتاب روی این دستگاه نیست.";
    case "throttled":
      return "امروز بیش از حد مجاز ذخیره آفلاین انجام داده‌اید. فردا دوباره تلاش کنید.";
    case "network":
      return "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.";
    case "device_limit":
      return "این دستگاه جزو دستگاه‌های مطالعه شما نیست.";
    default:
      return "ذخیره برای مطالعه آفلاین انجام نشد. دوباره تلاش کنید.";
  }
}

/** Remove a license's local copy too when it is the copy on this browser. */
async function purgeIfLocal(l: OfflineLicense): Promise<void> {
  const store = await getOfflineStore();
  const meta = await store?.getMeta(l.book).catch(() => null);
  if (meta && meta.license.id === l.id) await purgeOfflineBook(l.book);
}

const btnPrimary =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-bold text-surface hover:bg-primary-hover disabled:opacity-60";
const btnDanger =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60";

/**
 * «مطالعه آفلاین» in the EPUB settings sheet (Phase 6b): save the book encrypted on this device,
 * see until when it stays, delete it; on 409 offline_limit list the licensed books with «حذف».
 */
export function OfflinePanel({ off, info }: { off: OfflineBook; info: OfflineInfo }) {
  const [busy, setBusy] = useState<"save" | "remove" | number | null>(null);
  const [limit, setLimit] = useState<OfflineLicense[] | null>(null);
  const [message, setMessage] = useState("");

  const save = async () => {
    setBusy("save");
    setMessage("");
    const res = await off.save();
    setBusy(null);
    if (res.ok) {
      setLimit(null);
      setMessage("کتاب برای مطالعه آفلاین روی این دستگاه ذخیره شد.");
      return;
    }
    if (res.error.kind === "offline_limit") {
      setLimit(res.error.licenses);
      return;
    }
    setMessage(saveErrorText(res.error.kind));
  };

  const remove = async () => {
    setBusy("remove");
    setMessage("");
    const res = await off.remove();
    setBusy(null);
    setMessage(res.ok ? "نسخه آفلاین از این دستگاه حذف شد." : "حذف نسخه آفلاین انجام نشد. به اینترنت وصل شوید و دوباره تلاش کنید.");
  };

  const removeLicense = async (l: OfflineLicense) => {
    setBusy(l.id);
    setMessage("");
    const res = await deleteOfflineLicense(l.id);
    if (!res.ok && res.error.kind !== "no_ebook") {
      setBusy(null);
      setMessage("حذف انجام نشد. دوباره تلاش کنید.");
      return;
    }
    await purgeIfLocal(l);
    setLimit((list) => list?.filter((x) => x.id !== l.id) ?? null);
    setBusy(null);
    // a slot is free: save this book now
    await save();
  };

  const meta = off.meta;
  return (
    <section aria-labelledby="offline-heading" className="border-t border-line pt-4">
      <h3 id="offline-heading" className="mb-1.5 text-sm font-bold">
        مطالعه آفلاین
      </h3>

      {off.supported === false && !meta ? (
        <p className="text-sm leading-7 text-ink-muted">
          این مرورگر امکان نگه‌داری امن کتاب برای مطالعه بدون اینترنت را ندارد (برای نمونه در پنجره خصوصی). کتاب را همچنان
          می‌توانید آنلاین بخوانید.
        </p>
      ) : meta ? (
        <div className="space-y-2">
          <p className="flex items-start gap-2 rounded-control bg-success-soft p-3 text-sm font-bold leading-7 text-success">
            <CheckIcon size={20} className="mt-1 shrink-0" />
            <span>
              آفلاین تا <time dateTime={meta.license.expires_at}>{formatJalaliDate(meta.license.expires_at)}</time> روی این دستگاه
            </span>
          </p>
          <p className="text-xs leading-6 text-ink-muted">
            نسخه رمزگذاری‌شده فقط در همین مرورگر باز می‌شود و با اتصال به اینترنت، پیش از پایان مهلت خودکار تمدید می‌شود.
          </p>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy !== null || off.offline}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            {busy === "remove" ? "در حال حذف…" : "حذف نسخه آفلاین"}
          </button>
          {off.offline && <p className="text-xs leading-6 text-ink-muted">برای حذف نسخه آفلاین به اینترنت وصل شوید.</p>}
        </div>
      ) : limit ? (
        <div className="space-y-2">
          <p className="text-sm font-bold leading-7">سقف کتاب‌های آفلاین پر شده است</p>
          <p className="text-xs leading-6 text-ink-muted">
            {`حداکثر ${formatNumber(info.max_books)} کتاب را می‌توانید هم‌زمان آفلاین نگه دارید. برای ذخیره این کتاب، یکی از این‌ها را حذف کنید.`}
          </p>
          <ul className="space-y-2">
            {limit.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-control border border-line p-2 ps-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{l.title || l.book}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    <bdi>{l.device_label || "دستگاه ناشناس"}</bdi> · تا {formatJalaliDate(l.expires_at)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void removeLicense(l)}
                  aria-label={`حذف نسخه آفلاین ${l.title || l.book}`}
                  className={btnDanger}
                >
                  {busy === l.id ? "در حال حذف…" : "حذف"}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href={accountRoutes.devices}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            مدیریت کتاب‌های آفلاین و دستگاه‌ها
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-6 text-ink-muted">
            {`کتاب رمزگذاری‌شده روی همین دستگاه ذخیره می‌شود و بدون اینترنت هم باز می‌شود؛ تا ${formatNumber(
              info.max_books,
            )} کتاب، هر بار ${formatNumber(info.days)} روز.`}
          </p>
          <button type="button" onClick={() => void save()} disabled={busy !== null || off.offline} className={btnPrimary} aria-busy={busy === "save"}>
            <DownloadIcon size={18} />
            {busy === "save" ? "در حال ذخیره…" : "ذخیره برای مطالعه آفلاین"}
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-2 text-sm leading-7 empty:hidden">
        {message}
      </p>
    </section>
  );
}
