"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { accountRoutes } from "@/lib/account-routes";
import { formatJalaliDate, formatNumber } from "@/lib/format";
import { listDevices, removeDevice, type ReaderError } from "@/lib/reader";
import type { ReaderDevice } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { DevicesIcon } from "@/components/ui/Icons";

export const MAX_READER_DEVICES = 3;

function errorText(e: ReaderError, action: "list" | "remove"): string {
  if (e.kind === "throttled") {
    return action === "remove"
      ? "امروز بیش از حد مجاز دستگاه حذف کرده‌اید. فردا دوباره تلاش کنید."
      : "درخواست‌های زیادی فرستاده شد. کمی صبر کنید و دوباره تلاش کنید.";
  }
  if (e.kind === "network") return "اتصال برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.";
  return action === "remove" ? "حذف دستگاه انجام نشد. دوباره تلاش کنید." : "فهرست دستگاه‌ها فعلاً در دسترس نیست.";
}

type State = { status: "loading" } | { status: "error"; error: ReaderError } | { status: "ready"; devices: ReaderDevice[] };

/**
 * «دستگاه‌های من» (Phase 6b): the devices this account reads ebooks on (GET /library/devices/, with
 * this browser's X-Reader-Device so the server can mark it «این دستگاه»), each removable after a
 * confirmation (DELETE /library/devices/<id>/, a few per day → 429).
 */
export function DevicesManager() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [confirming, setConfirming] = useState<ReaderDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await listDevices();
    setState(res.ok ? { status: "ready", devices: res.data } : { status: "error", error: res.error });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRemove() {
    if (!confirming) return;
    setBusy(true);
    setRemoveError("");
    const res = await removeDevice(confirming.id);
    setBusy(false);
    if (!res.ok) return setRemoveError(errorText(res.error, "remove"));
    const label = confirming.label || "دستگاه";
    setConfirming(null);
    setStatus(`«${label}» از فهرست دستگاه‌ها حذف شد.`);
    await load();
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-black text-ink">دستگاه‌های من</h1>
      <p className="mb-4 text-sm leading-7 text-ink-muted">کتاب‌های الکترونیک روی حداکثر ۳ دستگاه خوانده می‌شوند.</p>

      <p role="status" aria-live="polite" className="mb-3 text-sm font-bold text-success empty:hidden">
        {status}
      </p>

      {state.status === "loading" && (
        <div className="space-y-3" role="status">
          <span className="sr-only">در حال بارگذاری دستگاه‌ها…</span>
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-card bg-surface p-4 shadow-card">
          {state.error.kind === "auth" ? (
            <p className="leading-8 text-ink">
              برای دیدن دستگاه‌ها دوباره{" "}
              <Link href={accountRoutes.login(accountRoutes.devices)} className="font-bold text-primary underline">
                وارد حساب شوید
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="leading-8 text-ink-muted">{errorText(state.error, "list")}</p>
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
            </>
          )}
        </div>
      )}

      {state.status === "ready" &&
        (state.devices.length === 0 ? (
          <p className="rounded-card bg-surface p-4 leading-8 text-ink-muted shadow-card">
            هنوز با هیچ دستگاهی کتاب الکترونیک نخوانده‌اید. هر مرورگری که با آن کتابی را باز کنید اینجا فهرست می‌شود.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs font-bold text-ink-muted">
              {`${formatNumber(state.devices.length)} از ${formatNumber(MAX_READER_DEVICES)} دستگاه`}
            </p>
            <ul className="space-y-3">
              {state.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
                  >
                    <DevicesIcon size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-ink" dir="auto">
                        {d.label || "دستگاه ناشناس"}
                      </span>
                      {d.current && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">این دستگاه</span>
                      )}
                    </p>
                    <p className="text-xs leading-6 text-ink-muted">
                      آخرین استفاده:{" "}
                      {d.last_seen ? <time dateTime={d.last_seen}>{formatJalaliDate(d.last_seen)}</time> : "نامشخص"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveError("");
                      setStatus("");
                      setConfirming(d);
                    }}
                    aria-label={`حذف دستگاه ${d.label || "ناشناس"}`}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-soft"
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-6 text-ink-muted">
              برای امنیت حساب، در هر روز تنها چند دستگاه را می‌توانید حذف کنید. دستگاهی که ۹۰ روز استفاده نشود، خودبه‌خود از
              شمار دستگاه‌ها بیرون می‌رود.
            </p>
          </>
        ))}

      <Dialog open={confirming != null} onClose={() => setConfirming(null)} title="حذف دستگاه">
        {confirming && (
          <>
            <p className="leading-8">«{confirming.label || "دستگاه ناشناس"}» از دستگاه‌های مطالعه شما حذف شود؟</p>
            {confirming.current && (
              <p className="mt-2 rounded-control bg-warning-soft p-3 text-sm leading-7 text-ink">
                این همان دستگاهی است که الان با آن کار می‌کنید. پس از حذف، برای خواندن کتاب روی همین دستگاه باید دوباره ثبت شود
                و یکی از ۳ جایگاه را می‌گیرد.
              </p>
            )}
            <p role="alert" className="mt-2 text-sm font-bold text-danger empty:hidden">
              {removeError}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="min-h-11 rounded-control px-4 font-bold text-ink-muted hover:bg-primary-soft"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void confirmRemove()}
                disabled={busy}
                className="min-h-11 rounded-control bg-danger px-5 font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "در حال حذف…" : "حذف دستگاه"}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
